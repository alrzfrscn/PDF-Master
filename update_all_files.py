#!/usr/bin/env python3
import sys
import threading
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

# پسوندهای پیش‌فرض برای نادیده گرفتن
DEFAULT_SKIP_EXTS = {
    ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".pdf", ".zip", ".exe",
    ".db", ".sqlite", ".sqlite3", ".env", ".pem", ".key", ".pyc"
}

# پوشه‌های معروفی که معمولاً نباید اسکن شوند
DEFAULT_SKIP_DIRS = {
    ".next", ".git", "node_modules", "__pycache__", ".idea", ".vscode", "venv", ".venv"
}

# فایل‌های تکی که نادیده گرفته می‌شوند
DEFAULT_SKIP_FILES = {
    ".env", ".env.local", ".env.development", ".env.production",
    "package-lock.json", "all_files.txt", "dev.db", "dev.db-journal"
}


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("ابزار اسکن و ادغام پوشه‌ها در یک فایل متنی")
        self.geometry("700x750")
        self.minsize(600, 650)

        self.root_path = Path.cwd()
        self.dir_check_vars = {}  # برای ذخیره وضعیت تیک چک‌باکس‌ها
        self.include_root_files_var = tk.BooleanVar(value=True)

        self._build_ui()

    def _build_ui(self):
        # 1. فریم انتخاب مسیر مبدا
        frame_input = ttk.LabelFrame(self, text=" ۱. انتخاب پوشه پروژه (Root Directory) ", padding=10)
        frame_input.pack(fill="x", padx=10, pady=5)

        self.entry_root = ttk.Entry(frame_input)
        self.entry_root.insert(0, str(self.root_path))
        self.entry_root.pack(side="left", fill="x", expand=True, padx=(0, 5))

        btn_browse_root = ttk.Button(frame_input, text="انتخاب مسیر...", command=self.browse_root_dir)
        btn_browse_root.pack(side="right")

        # 2. فریم انتخاب پوشه‌ها
        frame_dirs = ttk.LabelFrame(self, text=" ۲. انتخاب پوشه‌های مورد نظر برای استخراج ", padding=10)
        frame_dirs.pack(fill="both", expand=True, padx=10, pady=5)

        # دکمه‌های کنترلی سریع
        btn_box = ttk.Frame(frame_dirs)
        btn_box.pack(fill="x", pady=(0, 5))

        ttk.Button(btn_box, text="انتخاب همه", command=self.select_all_dirs).pack(side="left", padx=2)
        ttk.Button(btn_box, text="لغو همه", command=self.deselect_all_dirs).pack(side="left", padx=2)
        ttk.Checkbutton(btn_box, text="شامل فایل‌های موجود در ریشه (Root Files)", variable=self.include_root_files_var).pack(side="right", padx=5)

        # ساخت اسکرول‌بار برای لیست پوشه‌ها
        canvas_frame = ttk.Frame(frame_dirs)
        canvas_frame.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(canvas_frame, borderwidth=0, highlightthickness=0)
        self.scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = ttk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

        # 3. فریم فایل خروجی
        frame_output = ttk.LabelFrame(self, text=" ۳. فایل خروجی ", padding=10)
        frame_output.pack(fill="x", padx=10, pady=5)

        self.entry_output = ttk.Entry(frame_output)
        self.entry_output.insert(0, str(self.root_path / "all_files.txt"))
        self.entry_output.pack(side="left", fill="x", expand=True, padx=(0, 5))

        btn_browse_out = ttk.Button(frame_output, text="تغییر مقصد...", command=self.browse_output_file)
        btn_browse_out.pack(side="right")

        # 4. دکمه اجرا
        self.btn_run = tk.Button(
            self, text="شروع اسکن و ایجاد فایل", font=("Segoe UI", 11, "bold"),
            bg="#007acc", fg="white", activebackground="#005999", activeforeground="white",
            relief="flat", pady=8, command=self.start_processing
        )
        self.btn_run.pack(fill="x", padx=10, pady=8)

        # 5. گزارش و کنسول وضعیت
        frame_logs = ttk.LabelFrame(self, text=" گزارش وضعیت و آمار ", padding=5)
        frame_logs.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.txt_log = scrolledtext.ScrolledText(frame_logs, height=8, font=("Consolas", 9))
        self.txt_log.pack(fill="both", expand=True)

        # پر کردن اولیه لیست پوشه‌ها
        self.refresh_directories_list()

    def browse_root_dir(self):
        selected = filedialog.askdirectory(initialdir=self.root_path, title="انتخاب پوشه پروژه")
        if selected:
            self.root_path = Path(selected)
            self.entry_root.delete(0, tk.END)
            self.entry_root.insert(0, str(self.root_path))
            self.entry_output.delete(0, tk.END)
            self.entry_output.insert(0, str(self.root_path / "all_files.txt"))
            self.refresh_directories_list()

    def browse_output_file(self):
        selected = filedialog.asksaveasfilename(
            initialdir=self.root_path,
            initialfile="all_files.txt",
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        if selected:
            self.entry_output.delete(0, tk.END)
            self.entry_output.insert(0, selected)

    def refresh_directories_list(self):
        # پاک کردن المان‌های قبلی
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        self.dir_check_vars.clear()

        try:
            subdirs = sorted([p for p in self.root_path.iterdir() if p.is_dir()])
        except Exception as e:
            self.log(f"خطا در خواندن پوشه: {e}")
            return

        if not subdirs:
            lbl = ttk.Label(self.scrollable_frame, text="هیچ زیرپوشه‌ای در این مسیر پیدا نشد.", foreground="gray")
            lbl.pack(anchor="w", padx=5, pady=5)
            return

        for directory in subdirs:
            dirname = directory.name
            # اگر پوشه سیستمی/بی‌اهمیت باشد پیش‌فرض غیرفعال است
            is_default_checked = dirname not in DEFAULT_SKIP_DIRS
            var = tk.BooleanVar(value=is_default_checked)
            self.dir_check_vars[dirname] = var

            chk = ttk.Checkbutton(
                self.scrollable_frame,
                text=dirname if is_default_checked else f"{dirname} (پیشنهاد حذف)",
                variable=var
            )
            chk.pack(anchor="w", padx=5, pady=2)

    def select_all_dirs(self):
        for var in self.dir_check_vars.values():
            var.set(True)

    def deselect_all_dirs(self):
        for var in self.dir_check_vars.values():
            var.set(False)

    def log(self, message):
        self.txt_log.insert(tk.END, message + "\n")
        self.txt_log.see(tk.END)

    def start_processing(self):
        # غیرفعال کردن دکمه حین پردازش
        self.btn_run.config(state="disabled")
        self.txt_log.delete(1.0, tk.END)
        # اجرای پردازش در ترد جداگانه تا UI هنگ نکند
        threading.Thread(target=self._process_files, daemon=True).start()

    def _process_files(self):
        try:
            root = Path(self.entry_root.get()).resolve()
            output_file = Path(self.entry_output.get()).resolve()

            if not root.is_dir():
                self.log("خطا: مسیر پوشه مبدا نامعتبر است!")
                messagebox.showerror("خطا", "پوشه مبدا وجود ندارد.")
                return

            selected_dirs = {name for name, var in self.dir_check_vars.items() if var.get()}
            include_root_files = self.include_root_files_var.get()

            self.log(f"شروع پردازش از: {root}")
            self.log(f"پوشه‌های انتخاب‌شده: {', '.join(selected_dirs) if selected_dirs else 'هیچ‌کدام'}")
            self.log(f"فایل‌های ریشه: {'بله' if include_root_files else 'خیر'}")
            self.log("-" * 50)

            files_to_process = []

            # 1. فایل‌های مستقیم ریشه
            if include_root_files:
                for item in root.iterdir():
                    if item.is_file():
                        if item.name in DEFAULT_SKIP_FILES:
                            continue
                        if item.suffix.lower() in DEFAULT_SKIP_EXTS:
                            continue
                        if item.resolve() == output_file:
                            continue
                        files_to_process.append(item)

            # 2. اسکن زیرپوشه‌های انتخاب‌شده
            for dirname in selected_dirs:
                target_dir = root / dirname
                if not target_dir.exists():
                    continue

                for file_path in target_dir.rglob("*"):
                    relative_parts = file_path.relative_to(root).parts

                    # صرف نظر از پوشه‌های غیرمجاز درون مسیر
                    if any(part in DEFAULT_SKIP_DIRS for part in relative_parts):
                        continue

                    if file_path.is_file():
                        if file_path.name in DEFAULT_SKIP_FILES:
                            continue
                        if file_path.suffix.lower() in DEFAULT_SKIP_EXTS:
                            continue
                        if file_path.resolve() == output_file:
                            continue
                        files_to_process.append(file_path)

            # مرتب‌سازی مسیرها
            files_to_process.sort(key=lambda f: f.relative_to(root).as_posix())

            total_found = len(files_to_process)
            self.log(f"تعداد کل فایل‌های تایید شده: {total_found}")

            if total_found == 0:
                self.log("هیچ فایلی مطابق معیارهای انتخابی پیدا نشد.")
                messagebox.showwarning("هشدار", "هیچ فایلی برای کپی پیدا نشد!")
                return

            # ساخت هدر فایل متنی
            lines = [
                "=" * 80,
                f"  Generated from: {root}",
                f"  Total Files Included: {total_found}",
                "=" * 80,
                "",
            ]

            read_errors = 0
            for idx, filepath in enumerate(files_to_process, 1):
                rel_str = filepath.relative_to(root).as_posix()
                lines.append("=" * 80)
                lines.append(f"FILE: {rel_str}")
                lines.append("=" * 80)

                try:
                    # تلاش برای خواندن با utf-8
                    content = filepath.read_text(encoding="utf-8", errors="replace")
                    lines.append(content)
                except Exception as e:
                    read_errors += 1
                    lines.append(f"[ERROR reading file: {e}]")

                lines.append("")

            # نوشتن در فایل خروجی
            final_content = "\n".join(lines)
            output_file.write_text(final_content, encoding="utf-8")

            file_size_kb = output_file.stat().st_size / 1024

            self.log("-" * 50)
            self.log(f"عملیات با موفقیت انجام شد!")
            self.log(f"✔ فایل ذخیره شد در: {output_file}")
            self.log(f"✔ تعداد کل فایل‌ها: {total_found}")
            self.log(f"✔ حجم فایل خروجی: {file_size_kb:.1f} KB")
            if read_errors > 0:
                self.log(f"⚠ تعداد خطاهای خواندن: {read_errors}")

            messagebox.showinfo(
                "اتمام کار",
                f"عملیات با موفقیت پایان یافت!\n\n"
                f"تعداد فایل‌ها: {total_found}\n"
                f"حجم خروجی: {file_size_kb:.1f} KB\n"
                f"مسیر: {output_file.name}"
            )

        except Exception as e:
            self.log(f"خطای سیستمی رخ داد: {e}")
            messagebox.showerror("خطا", str(e))
        finally:
            self.btn_run.config(state="normal")


if __name__ == "__main__":
    app = App()
    app.mainloop()