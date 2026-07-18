import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const MONEY_OBJECTIVE = "money";
const COMMAND_PREFIX = "!";
const CHAT_SHORTCUTS_SUPPORTED = Boolean(world.beforeEvents?.chatSend?.subscribe);
const SELL_CHEST_BLOCK = "minecraft:chest";
const SELL_CHEST_TIMEOUT_TICKS = 20 * 60 * 5;

const SHOP_ITEMS = [
  { key: "diamond", typeId: "minecraft:diamond", name: "Diamond", category: "Ores", buy: 250, sell: 125 },
  { key: "emerald", typeId: "minecraft:emerald", name: "Emerald", category: "Ores", buy: 180, sell: 90 },
  { key: "gold_ingot", typeId: "minecraft:gold_ingot", name: "Gold Ingot", category: "Ores", buy: 80, sell: 40 },
  { key: "iron_ingot", typeId: "minecraft:iron_ingot", name: "Iron Ingot", category: "Ores", buy: 50, sell: 25 },
  { key: "coal", typeId: "minecraft:coal", name: "Coal", category: "Ores", buy: 12, sell: 6 },
  { key: "oak_log", typeId: "minecraft:oak_log", name: "Oak Log", category: "Blocks", buy: 10, sell: 5 },
  { key: "cobblestone", typeId: "minecraft:cobblestone", name: "Cobblestone", category: "Blocks", buy: 4, sell: 2 },
  { key: "wheat", typeId: "minecraft:wheat", name: "Wheat", category: "Farming", buy: 8, sell: 4 },
  { key: "carrot", typeId: "minecraft:carrot", name: "Carrot", category: "Farming", buy: 8, sell: 4 },
  { key: "beef", typeId: "minecraft:beef", name: "Raw Beef", category: "Food", buy: 14, sell: 7 },
];

const SHOP_BY_TYPE = new Map(SHOP_ITEMS.map((item) => [item.typeId, item]));
const sellChestSessions = new Map();

function tell(player, message) {
  player.sendMessage(`§6[Shop]§r ${message}`);
}

function getInventory(player) {
  return player.getComponent("minecraft:inventory")?.container;
}

function getMoneyObjective() {
  let objective = world.scoreboard.getObjective(MONEY_OBJECTIVE);
  if (!objective) objective = world.scoreboard.addObjective(MONEY_OBJECTIVE, "Money");
  return objective;
}

function getBalance(player) {
  try {
    const score = getMoneyObjective().getScore(player.scoreboardIdentity);
    return score ?? 0;
  } catch {
    return 0;
  }
}

function addBalance(player, amount) {
  if (!player.scoreboardIdentity || amount === 0) return;
  getMoneyObjective().addScore(player.scoreboardIdentity, amount);
}

function removeBalance(player, amount) {
  if (!player.scoreboardIdentity || amount === 0) return;
  getMoneyObjective().addScore(player.scoreboardIdentity, -amount);
}

function removeItems(player, typeId, amount) {
  const inventory = getInventory(player);
  if (!inventory || amount <= 0) return 0;

  let remaining = amount;
  for (let slot = 0; slot < inventory.size && remaining > 0; slot++) {
    const item = inventory.getItem(slot);
    if (!item || item.typeId !== typeId) continue;

    const taken = Math.min(item.amount, remaining);
    remaining -= taken;

    if (item.amount === taken) {
      inventory.setItem(slot, undefined);
    } else {
      item.amount -= taken;
      inventory.setItem(slot, item);
    }
  }

  return amount - remaining;
}

function scanSellableInventory(player) {
  const inventory = getInventory(player);
  const totals = new Map();
  if (!inventory) return totals;

  for (let slot = 0; slot < inventory.size; slot++) {
    const item = inventory.getItem(slot);
    if (!item) continue;

    const shopItem = SHOP_BY_TYPE.get(item.typeId);
    if (!shopItem || shopItem.sell <= 0) continue;
    totals.set(item.typeId, (totals.get(item.typeId) ?? 0) + item.amount);
  }

  return totals;
}

function sellAll(player) {
  const totals = scanSellableInventory(player);
  if (totals.size === 0) {
    tell(player, "Tidak ada item yang bisa dijual di inventory kamu.");
    return;
  }

  let earned = 0;
  const lines = [];
  for (const [typeId, amount] of totals) {
    const shopItem = SHOP_BY_TYPE.get(typeId);
    const removed = removeItems(player, typeId, amount);
    const value = removed * shopItem.sell;
    earned += value;
    lines.push(`§e${shopItem.name} x${removed}§r = §a$${value}`);
  }

  addBalance(player, earned);
  tell(player, `Sell all sukses: §a+$${earned}§r. Saldo: §a$${getBalance(player)}§r.`);
  player.sendMessage(lines.join("\n"));
}

function getFacingOffset(player) {
  const view = player.getViewDirection();
  if (Math.abs(view.x) > Math.abs(view.z)) return { x: view.x > 0 ? 1 : -1, y: 0, z: 0 };
  return { x: 0, y: 0, z: view.z > 0 ? 1 : -1 };
}

function getSellChestLocation(player) {
  const base = player.location;
  const offset = getFacingOffset(player);
  return {
    x: Math.floor(base.x + offset.x),
    y: Math.floor(base.y),
    z: Math.floor(base.z + offset.z),
  };
}

function startSellChest(player) {
  cleanupSellChest(player, false);

  const dimension = player.dimension;
  const location = getSellChestLocation(player);
  const block = dimension.getBlock(location);
  if (!block || !block.isAir) {
    tell(player, "Butuh 1 block kosong di depan kamu untuk sell chest.");
    return;
  }

  block.setType(SELL_CHEST_BLOCK);
  sellChestSessions.set(player.id, {
    dimensionId: dimension.id,
    location,
    expiresAt: system.currentTick + SELL_CHEST_TIMEOUT_TICKS,
  });

  tell(player, `Sell chest dibuat di depan kamu. Masukkan item, lalu ketik §e${sellCommand("confirm")}§r. Ketik §e${sellCommand("cancel")}§r untuk batal.`);
}

function cleanupSellChest(player, returnItems) {
  const session = sellChestSessions.get(player.id);
  if (!session) return;

  const dimension = world.getDimension(session.dimensionId);
  const block = dimension.getBlock(session.location);
  const container = block?.getComponent("minecraft:inventory")?.container;

  if (returnItems && container) {
    const inventory = getInventory(player);
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (!item) continue;
      const leftover = inventory?.addItem(item);
      if (leftover) dimension.spawnItem(leftover, session.location);
      container.setItem(slot, undefined);
    }
  }

  if (block?.typeId === SELL_CHEST_BLOCK) block.setType("minecraft:air");
  sellChestSessions.delete(player.id);
}

function confirmSellChest(player) {
  const session = sellChestSessions.get(player.id);
  if (!session) {
    tell(player, `Kamu belum punya sell chest aktif. Ketik §e${sellCommand("chest")}§r dulu.`);
    return;
  }

  const dimension = world.getDimension(session.dimensionId);
  const block = dimension.getBlock(session.location);
  const container = block?.getComponent("minecraft:inventory")?.container;
  if (!container) {
    sellChestSessions.delete(player.id);
    tell(player, "Sell chest tidak ditemukan, sesi dibatalkan.");
    return;
  }

  let earned = 0;
  const unsold = [];
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;

    const shopItem = SHOP_BY_TYPE.get(item.typeId);
    if (!shopItem || shopItem.sell <= 0) {
      unsold.push(item);
      container.setItem(slot, undefined);
      continue;
    }

    earned += item.amount * shopItem.sell;
    container.setItem(slot, undefined);
  }

  addBalance(player, earned);
  const inventory = getInventory(player);
  for (const item of unsold) {
    const leftover = inventory?.addItem(item);
    if (leftover) dimension.spawnItem(leftover, session.location);
  }

  if (block.typeId === SELL_CHEST_BLOCK) block.setType("minecraft:air");
  sellChestSessions.delete(player.id);

  if (earned <= 0) {
    tell(player, "Tidak ada item valid yang terjual. Item invalid sudah dikembalikan/drop.");
    return;
  }
  tell(player, `Sell chest sukses: §a+$${earned}§r. Saldo: §a$${getBalance(player)}§r.`);
}

async function showShop(player) {
  const categories = [...new Set(SHOP_ITEMS.map((item) => item.category))].sort();
  const form = new ActionFormData().title("Shop").body(`Saldo kamu: $${getBalance(player)}\nPilih kategori jual/beli.`);
  for (const category of categories) form.button(category);

  const response = await form.show(player);
  if (response.canceled) return;
  await showShopCategory(player, categories[response.selection]);
}

async function showShopCategory(player, category) {
  const items = SHOP_ITEMS.filter((item) => item.category === category);
  const form = new ActionFormData().title(`Shop - ${category}`).body(`Saldo: $${getBalance(player)}\nPilih item untuk beli atau lihat harga jual.`);
  for (const item of items) form.button(`${item.name}\nBuy $${item.buy} | Sell $${item.sell}`);

  const response = await form.show(player);
  if (response.canceled) return;
  await showItemTrade(player, items[response.selection]);
}

async function showItemTrade(player, shopItem) {
  const form = new ModalFormData()
    .title(shopItem.name)
    .dropdown("Aksi", ["Buy", "Sell dari inventory"], 0)
    .slider("Jumlah", 1, 64, 1, 1);

  const response = await form.show(player);
  if (response.canceled) return;

  const [actionIndex, amountValue] = response.formValues;
  const amount = Math.floor(Number(amountValue));
  if (actionIndex === 0) buyItem(player, shopItem, amount);
  else sellInventoryItem(player, shopItem, amount);
}

function buyItem(player, shopItem, amount) {
  const total = shopItem.buy * amount;
  if (getBalance(player) < total) {
    tell(player, `Saldo kurang. Butuh §a$${total}§r, saldo kamu §a$${getBalance(player)}§r.`);
    return;
  }

  const stack = new ItemStack(shopItem.typeId, amount);
  const leftover = getInventory(player)?.addItem(stack);
  const added = amount - (leftover?.amount ?? 0);
  if (added <= 0) {
    tell(player, "Inventory penuh. Transaksi dibatalkan.");
    return;
  }

  const charged = added * shopItem.buy;
  removeBalance(player, charged);
  if (leftover) tell(player, `Inventory hampir penuh; hanya berhasil beli §e${shopItem.name} x${added}§r.`);
  tell(player, `Berhasil beli §e${shopItem.name} x${added}§r seharga §a$${charged}§r. Saldo: §a$${getBalance(player)}§r.`);
}

function sellInventoryItem(player, shopItem, amount) {
  const removed = removeItems(player, shopItem.typeId, amount);
  if (removed <= 0) {
    tell(player, `Kamu tidak punya §e${shopItem.name}§r di inventory.`);
    return;
  }

  const earned = removed * shopItem.sell;
  addBalance(player, earned);
  tell(player, `Berhasil jual §e${shopItem.name} x${removed}§r: §a+$${earned}§r. Saldo: §a$${getBalance(player)}§r.`);
}

function handleSellCommand(player, args) {
  const mode = (args[0] ?? "all").toLowerCase();
  if (mode === "all") sellAll(player);
  else if (mode === "chest") startSellChest(player);
  else if (mode === "confirm") confirmSellChest(player);
  else if (mode === "cancel") {
    cleanupSellChest(player, true);
    tell(player, "Sell chest dibatalkan. Item dikembalikan/drop kalau inventory penuh.");
  } else {
    tell(player, `Pakai: §e${sellCommand("all")}§r, §e${sellCommand("chest")}§r, §e${sellCommand("confirm")}§r, atau §e${sellCommand("cancel")}§r.`);
  }
}

function handleChatCommand(player, message) {
  const parts = message.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);
  const command = (parts.shift() ?? "").toLowerCase();

  system.run(() => {
    if (command === "shop") showShop(player);
    else if (command === "sell") handleSellCommand(player, parts);
    else if (command === "money" || command === "balance") tell(player, `Saldo kamu: §a$${getBalance(player)}§r.`);
  });
}

function sellCommand(mode) {
  return CHAT_SHORTCUTS_SUPPORTED ? `!sell ${mode}` : `/shop:sell ${mode}`;
}

if (CHAT_SHORTCUTS_SUPPORTED) {
  world.beforeEvents.chatSend.subscribe((event) => {
    if (!event.message.startsWith(COMMAND_PREFIX)) return;
    event.cancel = true;
    handleChatCommand(event.sender, event.message);
  });
}

if (system.beforeEvents?.startup?.subscribe) {
  system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    if (!customCommandRegistry) return;

    customCommandRegistry.registerCommand(
      {
        name: "shop:shop",
        description: "Open the shop buy/sell UI.",
        permissionLevel: CommandPermissionLevel.Any,
      },
      (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "Player only." };
        system.run(() => showShop(player));
        return { status: CustomCommandStatus.Success };
      },
    );

    customCommandRegistry.registerCommand(
      {
        name: "shop:sell",
        description: "Sell all inventory items, open a physical sell chest, confirm, or cancel.",
        permissionLevel: CommandPermissionLevel.Any,
        optionalParameters: [{ name: "mode", type: CustomCommandParamType.String }],
      },
      (origin, mode) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "Player only." };
        system.run(() => handleSellCommand(player, [mode ?? "all"]));
        return { status: CustomCommandStatus.Success };
      },
    );
  });
}

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    const session = sellChestSessions.get(player.id);
    if (!session || system.currentTick < session.expiresAt) continue;
    cleanupSellChest(player, true);
    tell(player, "Sell chest timeout. Item dikembalikan/drop kalau inventory penuh.");
  }
}, 20 * 10);

