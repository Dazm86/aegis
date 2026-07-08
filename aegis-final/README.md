# 🧬 Aegis Dashboard Setup

این پوشه شامل فایل‌های لازم برای سایت Aegis هست.

## 📁 فایل‌های موجود:

```
aegis-final/
├── web/
│   └── dashboard.html          ← اینجاست! سایت اصلی
├── supabase/
│   ├── rls.sql                 ← دستورات امنیت
│   └── functions/
│       └── chat-deputy/
│           └── index.ts        ← Edge Function (چت با معاون)
└── README.md                   ← این فایل
```

---

## 🚀 مراحل راه‌اندازی:

### **مرحله ۱: Edge Function رو Deploy کن**

1. برو https://app.supabase.com → پروژه‌ت
2. سمت چپ → **Edge Functions** بزن
3. **"Deploy a new function"** → **"Via Editor"**
4. اسم: `chat-deputy`
5. کل محتوای `index.ts` رو کپی‌پیست کن
6. **Deploy** رو بزن

---

### **مرحله ۲: RLS اعمال کن**

1. Supabase → **SQL Editor** → **New query**
2. کل محتوای `rls.sql` رو کپی‌پیست کن
3. **Run** رو بزن

---

### **مرحله ۳: dashboard.html رو پر کن**

فایل `dashboard.html` رو توی هر ایدیتوری باز کن (VS Code, Notepad, etc)

خط‌های **۲۶۰-۲۶۲** رو پیدا کن:

```javascript
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-public-key-here";
const EDGE_FUNCTION_URL = "https://YOUR-PROJECT.supabase.co/functions/v1/chat-deputy";
```

**جایگزین کن:**

- `YOUR-PROJECT` ← Project ID از Supabase (Settings)
- `your-anon-public-key-here` ← Anon Public Key از Settings → API

**مثال:**
```javascript
const SUPABASE_URL = "https://xufbpsdtzrj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const EDGE_FUNCTION_URL = "https://xufbpsdtzrj.supabase.co/functions/v1/chat-deputy";
```

ذخیره کن.

---

### **مرحله ۴: سایت رو آنلاین کن**

**گزینه ۱ (سریع):** Netlify Drop
- برو https://app.netlify.com/drop
- `dashboard.html` رو بکش اونجا
- لینک‌ت رو بگیر و استفاده کن

**گزینه ۲:** GitHub + Vercel
- `dashboard.html` رو توی GitHub repository بذار
- Vercel.com → Import → انتخاب repository
- خودش deploy می‌کنه

**گزینه ۳:** محلی (فقط برای تست)
- `dashboard.html` رو باز کن توی مرورگر (File → Open)

---

## 🎯 استفاده:

1. سایت رو باز کن
2. تب **معاون** → یک ایده بنویس
3. **فرستادن** رو بزن
4. معاون پیشنهاد می‌ده
5. **ایجاد ماموریت** رو بزن
6. سیستم خودش شروع می‌کنه کار کنه

---

## ⚙️ فیچرها:

✅ **معاون** — چت و تبدیل ایده‌ها به ماموریت‌ها
✅ **APIs** — ذخیره و مدیریت API keys
✅ **توقف** — دکمه freeze برای متوقف کردن سیستم
✅ **بررسی کدها** — approve/reject کد‌های تولید‌شده
✅ **داشبورد** — تمام ماموریت‌ها و تصمیمات

---

## 🔑 کجا مقادیر رو پیدا کنی:

**Project URL و Anon Key:**
- Supabase dashboard → Settings → API
- اونجا می‌بینی

**Project ID:**
- Settings → کنار URL نوشته‌ست

---

## ❓ اگه مشکلی پیش آمد:

- **چت جواب نداد** → URL و Key درست هستن؟
- **404 Edge Function** → Edge Function deploy شد؟
- **سایت نشون نداده شد** → HTML رو درست آپلود کردی؟

موفق باشی! 🎉
