Hãy xây dựng một ứng dụng web “Ghi âm nhanh & Tóm tắt meeting” có giao diện đơn giản, dễ dùng, phù hợp để sau này đóng gói thành popup của Chrome Extension.  

> **Mục tiêu chung**  
> - Người dùng có thể upload file ghi âm cuộc họp (ví dụ: .mp3, .wav, .m4a).  
> - Ứng dụng sẽ gửi audio lên Gemini để: (1) chuyển giọng nói thành văn bản, (2) tóm tắt nội dung chính, (3) trích xuất action items.  
> - Toàn bộ app chạy phía client (frontend), không phụ thuộc backend phức tạp, code gọn gàng để dễ tái sử dụng trong Chrome extension.  
>  
> **Yêu cầu kỹ thuật**  
> - Sử dụng HTML, CSS, JavaScript hoặc React + Tailwind CSS (tùy bạn chọn giải pháp đơn giản nhất để dễ đóng gói vào popup.html + script.js của Chrome extension).  
> - Không dùng build tool phức tạp (không cần Webpack/Vite trong project này). Hãy cố gắng tổ chức code sao cho có thể đặt toàn bộ UI vào một file HTML với 1 file JS chính là được.  
> - Tách rõ: phần UI, phần logic gọi API Gemini, phần xử lý dữ liệu (transcript, summary, action items).  
> - Đảm bảo app chạy tốt trong khung nhỏ (khoảng 400–600px chiều rộng) vì sau này sẽ hiển thị trong popup của Chrome extension.  
>  
> **Giao diện & UX**  
> - Header trên cùng:  
>   - Tiêu đề: “Ghi âm & Tóm tắt Meeting”  
>   - Subtext nhỏ: “Upload file ghi âm, nhận lại transcript, tóm tắt và action items trong vài giây.”  
> - Khu vực chính chia thành 2 cột trên desktop, 1 cột trên mobile:  
>   1. Cột trái: khu vực upload và cấu hình  
>      - Thẻ (card) upload file với:  
>        - Nút “Chọn file ghi âm” (chấp nhận .mp3, .wav, .m4a).  
>        - Hiển thị tên file đã chọn, dung lượng, và cảnh báo nếu file quá lớn.  
>      - Dropdown hoặc radio để chọn:  
>        - Ngôn ngữ chính của cuộc họp (ví dụ: Tiếng Việt, Tiếng Anh).  
>        - Độ chi tiết của tóm tắt: Ngắn gọn / Chuẩn / Chi tiết.  
>      - Checkbox/toggle:  
>        - “Tập trung vào action items & quyết định quan trọng”.  
>      - Nút chính (primary button) “Tóm tắt cuộc họp”.  
>      - Khi đang xử lý, hiển thị loading state: spinner + text “Đang transcribe & tóm tắt, vui lòng chờ…”.  
>   2. Cột phải: hiển thị kết quả  
>      - Tab hoặc section rõ ràng:  
>        - “Tóm tắt chính”: hiển thị dạng bullet point, tối đa 5–10 ý chính.  
>        - “Action items”: danh sách checkbox gồm các đầu việc, mỗi item gồm: mô tả, người phụ trách (nếu phát hiện được tên), deadline gợi ý.  
>        - “Transcript đầy đủ”: khung scrollable, font mono hoặc dễ đọc, thể hiện transcript theo thời gian.  
>      - Nút “Copy tóm tắt” để copy toàn bộ phần tóm tắt + action items vào clipboard.  
>      - Nút “Xuất Markdown” hoặc “Copy Markdown” (tùy chọn) để dễ dán vào Notion/Docs.  
>  
> **Luồng xử lý**  
> 1. Người dùng chọn file audio và nhấn “Tóm tắt cuộc họp”.  
> 2. Ứng dụng:  
>    - Gọi Gemini audio API để chuyển audio thành transcript.  
>    - Dựa trên transcript và lựa chọn cấu hình (ngôn ngữ, độ chi tiết, tập trung action items) để gọi Gemini sinh:  
>      - Tóm tắt dạng bullet.  
>      - Danh sách action items rõ ràng.  
> 3. Sau khi có kết quả, app cập nhật UI:  
>    - Hiển thị transcript đầy đủ.  
>    - Hiển thị tóm tắt ngắn gọn.  
>    - Hiển thị action items với checkbox.  
>  
> **Yêu cầu về code & kiến trúc (để dễ chuyển thành Chrome extension)**  
> - Viết code JavaScript theo kiểu module rõ ràng, tránh phụ thuộc vào global quá nhiều.  
> - Tách hàm:  
>   - `handleFileSelect`, `callGeminiForTranscription`, `callGeminiForSummary`, `renderSummary`, `renderActionItems`, `renderTranscript`.  
> - Không hard-code đường dẫn tuyệt đối; giả định rằng toàn bộ app có thể chạy từ một file `popup.html` + `popup.js` trong môi trường Chrome extension.  
> - Không sử dụng API hoặc tính năng không tương thích với Chrome extension popup (ví dụ: tránh `window.open` không cần thiết, tránh localStorage phức tạp – nếu cần thì bọc trong một lớp helper để sau này dễ chuyển qua chrome.storage).  
> - Thêm một đoạn chú thích ngắn trong code giải thích:  
>   - Phần nào sau này sẽ đặt trong `popup.html`.  
>   - Phần JS nào sẽ là `popup.js`.  
>  
> **Trải nghiệm người dùng nâng cao (nếu làm được)**  
> - Hiển thị ước tính thời lượng cuộc họp dựa trên độ dài audio.  
> - Cho phép người dùng chỉnh lại “tone” tóm tắt: Trung lập / Thân thiện / Formal.  
> - Cho phép chọn ngôn ngữ output tóm tắt (ví dụ: luôn tóm tắt bằng tiếng Việt, kể cả khi cuộc họp nói tiếng Anh).  
> - Thêm toast notification (góc dưới) khi:  
>   - Xử lý xong và tóm tắt đã sẵn sàng.  
>   - Copy tóm tắt thành công.  
>  
> Hãy trả về:  
> - Toàn bộ mã nguồn HTML/CSS/JS cần thiết để chạy ứng dụng ở dạng một trang web tĩnh.  
> - Giải thích ngắn ở cuối file hoặc comment trong code: cần chỉnh sửa gì để dùng trang này làm popup cho Chrome extension (ví dụ: đổi tên file thành `popup.html`, `popup.js`, thêm `manifest.json` với quyền cần thiết cho gọi API).  
