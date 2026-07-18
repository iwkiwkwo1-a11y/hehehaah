# Hehehaah Economy Shop

Behavior Pack Bedrock untuk fondasi ekonomi server:

- `/shop:shop` membuka UI shop untuk jual/beli.
- `/shop:sell all` menjual semua item sellable di inventory.
- `/shop:sell chest` membuat sell chest fisik di depan player.
- `/shop:sell confirm` menjual isi sell chest.
- `/shop:sell cancel` membatalkan sell chest dan mengembalikan item.
- Shortcut chat `!shop`, `!sell ...`, dan `!money` hanya aktif otomatis jika runtime Bedrock menyediakan `world.beforeEvents.chatSend`.

Saldo disimpan di scoreboard objective `money`. Item dan harga dasar ada di `scripts/main.js` pada konstanta `SHOP_ITEMS`.

## Target dan Catatan BDS 1.26.30.5

Manifest disiapkan untuk Bedrock `min_engine_version` `1.26.30`. Modul script menggunakan `@minecraft/server` versi `2.1.0` karena custom commands resmi ada di API 2.1.0, dan `@minecraft/server-ui` versi `2.0.0`.

Pada BDS `1.26.30.5`, `world.beforeEvents.chatSend` dapat tidak tersedia pada module API lama; pack tidak lagi mengakses event itu secara langsung agar server tidak crash. Jika event chat tidak ada, gunakan command resmi `/shop:shop` dan `/shop:sell ...`.
