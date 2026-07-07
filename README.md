# Aegis

سیستم چند-نقشی خودمختار که با یک قانون اساسی (`config/constitution.json`) اداره می‌شه.
فاز فعلی: **حلقه‌ی تصمیم‌گیری شورا** — هنوز کد نمی‌نویسه و منتشر نمی‌کنه، فقط مأموریت رو بررسی و تأیید/رد می‌کنه. این پایه‌ایه که مراحل بعدی (Coder واقعی، Deployer، انتشار محتوا) روش سوار می‌شه.

## ۱. راه‌اندازی Supabase

1. وارد پروژه‌ی Supabase‌ت شو → **SQL Editor** → New query
2. کل محتوای فایل `supabase/schema.sql` رو کپی و اجرا کن (فقط یک‌بار لازمه)
3. از **Project Settings → API** این دو مقدار رو بردار:
   - `Project URL` → می‌شه `SUPABASE_URL`
   - `service_role key` (نه anon key) → می‌شه `SUPABASE_SERVICE_KEY`

⚠️ `service_role key` دسترسی کامل داره — هیچ‌وقت جایی جز GitHub Secrets و `.env` محلی‌ات نذارش.

## ۱.۵ گرفتن کلید رایگان Groq (به‌جای OpenAI پولی)

1. برو https://console.groq.com/keys
2. با گوگل یا ایمیل ثبت‌نام کن (رایگان، بدون نیاز به کارت بانکی)
3. یه API key بساز و کپیش کن — این می‌شه `AI_API_KEY`

مدل پیش‌فرض `llama-3.3-70b-versatile` هست که رایگانه و برای این پروژه کافیه.

## ۲. راه‌اندازی روی Termux

```bash
pkg install nodejs git -y
git clone <آدرس-ریپوی-گیت‌هاب-خودت>
cd aegis
npm install
cp .env.example .env
# حالا .env رو با nano یا vim باز کن و مقادیر واقعی رو بذار
nano .env
```

## ۳. تست محلی (قبل از فعال کردن GitHub Actions)

یه مأموریت تستی مستقیم توی Supabase اضافه کن (SQL Editor):

```sql
insert into missions (title, description)
values ('Improve Homepage', 'Make the homepage look cleaner and more welcoming.');
```

بعد اجرا کن:

```bash
npm run heartbeat
```

باید ببینی شورا (Deputy, Coder, Enforcer, Deployer) هر کدوم نظر می‌دن، امتیاز می‌دن، و در نهایت مأموریت تأیید یا رد می‌شه. نتیجه رو توی جدول‌های `council_decisions` و `decisions` در Supabase هم می‌تونی ببینی.

## ۴. فعال کردن اجرای خودکار (GitHub Actions)

1. ریپو رو پوش کن روی GitHub (private repo)
2. برو **Settings → Secrets and variables → Actions → New repository secret** و این سه‌تا رو اضافه کن:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `AI_API_KEY` (کلید Groq)
3. تب **Actions** رو باز کن — workflow به اسم "Aegis Heartbeat" هر ساعت خودش اجرا می‌شه، حتی اگه گوشیت خاموش باشه.
4. برای تست فوری، از تب Actions روی "Run workflow" بزن (بدون نیاز به صبر کردن یک ساعت).

## ۵. کنترل بودجه

`MONTHLY_BUDGET_USD` توی `.env` (یا GitHub Secrets) سقف هزینه‌ی ماهانه‌ست. سیستم خودش هزینه‌ی هر تماس API رو تخمین می‌زنه و توی جدول `budget_tracker` جمع می‌زنه؛ وقتی به سقف برسه، خودش اجرا رو متوقف می‌کنه تا ماه بعد یا تا این‌که سقف رو دستی بالا ببری.

## مراحل بعدی (هنوز پیاده نشده)

- نقش Coder واقعاً کد/محتوا تولید کنه و بره توی `content_queue`
- صف تأیید انسانی برای محتوای عمومی
- نقش Deployer تغییرات تأییدشده رو از sandbox به production ببره
- اتصال انتشار خودکار به شبکه‌های اجتماعی (بعد از اینکه فاز تأیید انسانی چند هفته درست کار کرد)
