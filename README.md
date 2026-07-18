# Hehehaah Economy Shop

Behavior Pack Bedrock untuk fondasi ekonomi server:

- `!shop` atau `/shop:shop` membuka UI shop untuk jual/beli.
- `!sell all` atau `/shop:sell all` menjual semua item sellable di inventory.
- `!sell chest` atau `/shop:sell chest` membuat sell chest fisik di depan player.
- `!sell confirm` atau `/shop:sell confirm` menjual isi sell chest.
- `!sell cancel` atau `/shop:sell cancel` membatalkan sell chest dan mengembalikan item.
- `!money` menampilkan saldo player.

Saldo disimpan di scoreboard objective `money`. Item dan harga dasar ada di `scripts/main.js` pada konstanta `SHOP_ITEMS`.

## Target

Manifest disiapkan untuk Bedrock `min_engine_version` `1.26.30`. Modul script menggunakan `@minecraft/server` dan `@minecraft/server-ui` versi `2.0.0`.
