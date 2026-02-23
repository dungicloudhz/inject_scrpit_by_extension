# Shopee Best-Selling Scraper - Chrome Extension

Thu thap san pham ban chay tu cua hang Shopee va xuat ra file Excel (.xlsx).

## Cai dat

1. Mo Chrome, truy cap `chrome://extensions/`
2. Bat **Developer mode** (goc tren ben phai)
3. Click **Load unpacked**
4. Chon thu muc chua extension nay
5. Extension se xuat hien tren thanh cong cu Chrome

## Cach su dung

1. Truy cap trang cua hang tren `shopee.vn` (VD: `shopee.vn/tenshop`)
2. Click vao tab **"Ban Chay"** de xem san pham ban chay
3. Click vao icon extension tren thanh cong cu
4. Bam nut **"Bat dau thu thap"**
5. Cho extension thu thap du lieu (tu dong chuyen trang)
6. Khi hoan thanh, bam **"Tai file Excel"** de tai ve

## Du lieu thu thap

| Cot | Mo ta |
|-----|-------|
| STT | So thu tu |
| Ten san pham | Ten san pham |
| Ten cua hang | Ten cua hang |
| Gia tien (d) | Gia ban hien tai (VND) |
| Hoa hong (d) | So tien hoa hong (VND) |
| % Hoa hong | Phan tram hoa hong |
| Luot ban/thang | So luot ban trong thang |

## File Excel

- Ten file: `{ten_shop}_bestselling_{YYYY-MM-DD}.xlsx`
- Ho tro tieng Viet (UTF-8)
- Header duoc to mau cam Shopee

## Luu y

- Giu popup mo trong khi thu thap du lieu
- Extension tu dong delay 2-4 giay giua cac trang de tranh bi block
- Neu bi loi, thu tai lai trang va chay lai
- Khong dung CSS class names (vi Shopee thay doi lien tuc), dung text-based selectors

## Cau truc file

```
manifest.json      - Manifest V3 configuration
content.js         - Logic thu thap du lieu (chay tren trang Shopee)
popup.html         - Giao dien popup
popup.css          - Style cho popup
popup.js           - Logic popup (dieu khien, tai Excel)
xlsx-writer.js     - Thu vien tao file Excel (tu viet, khong can thu vien ngoai)
background.js      - Service worker
```
