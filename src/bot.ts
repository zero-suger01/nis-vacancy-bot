import "dotenv/config";
import {
  Bot,
  Context,
  Keyboard,
  session,
  type SessionFlavor,
  type StorageAdapter,
} from "grammy";
import { Redis } from "@upstash/redis";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN env var (get one from @BotFather).");
}
if (!ADMIN_CHAT_ID) {
  throw new Error(
    "Missing ADMIN_CHAT_ID env var (the chat/group that receives applications).",
  );
}
const adminChatId = ADMIN_CHAT_ID;
// Optional: Google Apps Script web app URL that appends a row to the spreadsheet.
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;

type AnswerKey =
  | "fullName"
  | "gender"
  | "age"
  | "address"
  | "phone"
  | "education"
  | "specialty"
  | "certificates"
  | "experience"
  | "branch"
  | "duration";

interface Step {
  key: AnswerKey;
  prompt: string;
  keyboard?: Keyboard;
  /** Returns an error message to show the user, or undefined if the answer is valid. */
  validate?: (text: string) => string | undefined;
}

const genderKeyboard = new Keyboard().text("Ayol").text("Erkak").resized().oneTime();

const phoneKeyboard = new Keyboard()
  .requestContact("📱 Telefon raqamimni ulashish")
  .resized()
  .oneTime();

const DISTRICTS = [
  "Chortoq",
  "Chust",
  "Davlatobod",
  "Kosonsoy",
  "Mingbuloq",
  "Norin",
  "Pop",
  "Toʻraqoʻrgʻon",
  "Uchqoʻrgʻon",
  "Uychi",
  "Namangan Shaxri",
  "Yangiqoʻrgʻon",
];

const districtKeyboard = (() => {
  const kb = new Keyboard();
  DISTRICTS.forEach((district, i) => {
    kb.text(district);
    if (i % 3 === 2) kb.row();
  });
  return kb.resized().oneTime();
})();

const BRANCH_OPTIONS = [
  "Chortoq tumani filiali",
  "Uychi tumani filiali",
  "Kosonsoy",
  "Pop",
  "Namangan Shaxar",
  "Hali hal qilmadim",
];

const branchKeyboard = (() => {
  const kb = new Keyboard();
  BRANCH_OPTIONS.forEach((opt, i) => {
    kb.text(opt);
    if (i % 2 === 1) kb.row();
  });
  return kb.resized().oneTime();
})();

const BRANCH_STEP_INDEX = 9; // index of branch in STEPS array

const STEPS: Step[] = [
  { key: "fullName", prompt: "To'liq ism-sharifingizni yozing:" },
  {
    key: "gender",
    prompt: "Jinsingizni tanlang:",
    keyboard: genderKeyboard,
    validate: (text) =>
      ["ayol", "erkak"].includes(text.toLowerCase())
        ? undefined
        : "Iltimos, quyidagi tugmalardan birini tanlang: Ayol yoki Erkak.",
  },
  {
    key: "age",
    prompt: "Yoshingizni yozing:",
    validate: (text) => {
      const age = Number(text);
      return Number.isInteger(age) && age >= 15 && age <= 80
        ? undefined
        : "Iltimos, yoshingizni raqamda yozing (masalan: 25).";
    },
  },
  {
    key: "address",
    prompt: "Yashash manzilingizni tanlang:",
    keyboard: districtKeyboard,
    validate: (text) =>
      DISTRICTS.includes(text)
        ? undefined
        : "Iltimos, quyidagi tugmalardan tumaningizni tanlang.",
  },
  {
    key: "phone",
    prompt:
      "Telefon raqamingizni yozing:\nRaqamni yozishingiz yoki quyidagi tugma orqali kontaktingizni ulashishingiz mumkin.",
    keyboard: phoneKeyboard,
  },
  {
    key: "education",
    prompt: "Ma'lumotingiz haqida yozing (daraja, universitet, yili):",
  },
  { key: "specialty", prompt: "Mutaxassisligingizni yozing:" },
  {
    key: "certificates",
    prompt:
      "Qo'lga kiritgan sertifikatlaringizni yozing (CEFR, SAT, IELTS va boshqalar). Sertifikatingiz bo'lmasa, \"Yo'q\" deb yozing:",
  },
  {
    key: "experience",
    prompt:
      "Ish tajribangizni qisqacha yozing (necha yil, qayerda, qaysi lavozimda):",
  },
  {
    key: "branch",
    prompt:
      "Namangan International School (NIS) maktabining qaysi filialiga topshirmoqchisiz?",
    keyboard: branchKeyboard,
    validate: (text) =>
      BRANCH_OPTIONS.includes(text)
        ? undefined
        : "Iltimos, quyidagi tugmalardan birini tanlang.",
  },
  {
    key: "duration",
    prompt:
      "Namangan International School (NIS) maktabida qancha muddat ishlamoqchisiz?",
  },
];

const SKIP_TEXT = "⏭ O'tkazib yuborish";
const skipKeyboard = new Keyboard().text(SKIP_TEXT).resized().oneTime();

const CV_PROMPT =
  "CV (rezyume)ingizni fayl sifatida yuboring (PDF yoki Word). Hozircha CV bo'lmasa, quyidagi tugmani bosing.";

const TOTAL_QUESTIONS = STEPS.length + 1; // text/button questions + CV upload

function questionHeader(num: number): string {
  return `📝 Savol ${num} / ${TOTAL_QUESTIONS}`;
}

const CONFIRM_TEXT = "✅ Tasdiqlayman";
const DECLINE_TEXT = "❌ Bekor qilaman";
const confirmKeyboard = new Keyboard()
  .text(CONFIRM_TEXT)
  .text(DECLINE_TEXT)
  .resized()
  .oneTime();

// Step indexes: 0..STEPS.length-1 = questions, then CV upload, then confirmation.
const CV_STEP = STEPS.length;
const CONFIRM_STEP = STEPS.length + 1;

interface SessionData {
  step: number; // -1 = not started
  answers: Partial<Record<AnswerKey, string>>;
  branchSelections: string[];
  cvFileId?: string;
  cvFileName?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

// On Vercel each update may hit a fresh process, so in-memory sessions would
// lose the applicant's progress; Upstash Redis keeps it across invocations.
// Locally (no Upstash env vars) grammY falls back to in-memory sessions.
function createSessionStorage(): StorageAdapter<SessionData> | undefined {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return undefined;
  }
  const redis = Redis.fromEnv();
  return {
    read: async (key) =>
      (await redis.get<SessionData>(`session:${key}`)) ?? undefined,
    write: async (key, value) => {
      await redis.set(`session:${key}`, value);
    },
    delete: async (key) => {
      await redis.del(`session:${key}`);
    },
  };
}

export const bot = new Bot<BotContext>(BOT_TOKEN);

bot.use(
  session({
    initial: (): SessionData => ({ step: -1, answers: {}, branchSelections: [] }),
    storage: createSessionStorage(),
  }),
);

function resetSession(ctx: BotContext): void {
  ctx.session.step = -1;
  ctx.session.answers = {};
  ctx.session.branchSelections = [];
  ctx.session.cvFileId = undefined;
  ctx.session.cvFileName = undefined;
}

function answerLines(ctx: BotContext): string[] {
  const a = ctx.session.answers;
  return [
    `👤 F.I.Sh: ${a.fullName ?? "-"}`,
    `🚻 Jins: ${a.gender ?? "-"}`,
    `🎂 Yosh: ${a.age ?? "-"}`,
    `📍 Manzil: ${a.address ?? "-"}`,
    `📞 Telefon: ${a.phone ?? "-"}`,
    `🎓 Ma'lumoti: ${a.education ?? "-"}`,
    `🧑‍💼 Mutaxassislik: ${a.specialty ?? "-"}`,
    `📜 Sertifikatlar: ${a.certificates ?? "-"}`,
    `🛠 Tajriba: ${a.experience ?? "-"}`,
    `🏫 Filial: ${a.branch ?? "-"}`,
    `⏳ Ishlash muddati: ${a.duration ?? "-"}`,
    `📎 CV: ${ctx.session.cvFileName ?? (ctx.session.cvFileId ? "biriktirilgan" : "yuklanmagan")}`,
  ];
}

async function askCurrentStep(ctx: BotContext): Promise<void> {
  const step = ctx.session.step;
  if (step >= 0 && step < CV_STEP) {
    const current = STEPS[step];
    await ctx.reply(
      `${questionHeader(step + 1)} - ${current.prompt}`,
      current.keyboard ? { reply_markup: current.keyboard } : undefined,
    );
    return;
  }
  if (step === CV_STEP) {
    await ctx.reply(`${questionHeader(TOTAL_QUESTIONS)} - ${CV_PROMPT}`, {
      reply_markup: skipKeyboard,
    });
    return;
  }
  if (step === CONFIRM_STEP) {
    await ctx.reply(
      "Kiritilgan barcha ma'lumotlarning haqqoniyligini tasdiqlaysizmi?",
      { reply_markup: confirmKeyboard },
    );
  }
}

function buildAdminSummary(ctx: BotContext): string {
  const user = ctx.from;
  const username = user?.username ? `@${user.username}` : "(username yo'q)";
  return [
    "📋 Yangi NIS-Vacancy arizasi",
    "",
    ...answerLines(ctx),
    "",
    "✅ Nomzod barcha ma'lumotlarning haqqoniyligini tasdiqladi.",
    `Telegram: ${username} (id ${user?.id ?? "?"})`,
  ].join("\n");
}

async function appendToSheet(ctx: BotContext): Promise<void> {
  if (!SHEETS_WEBHOOK_URL) return;
  const a = ctx.session.answers;
  const user = ctx.from;
  const payload = {
    fullName: a.fullName ?? "-",
    gender: a.gender ?? "-",
    age: a.age ?? "-",
    address: a.address ?? "-",
    phone: a.phone ?? "-",
    education: a.education ?? "-",
    specialty: a.specialty ?? "-",
    certificates: a.certificates ?? "-",
    experience: a.experience ?? "-",
    branch: a.branch ?? "-",
    duration: a.duration ?? "-",
    cv: ctx.session.cvFileName ?? (ctx.session.cvFileId ? "biriktirilgan" : "yuklanmagan"),
    telegram: `${user?.username ? `@${user.username}` : "-"} (id ${user?.id ?? "?"})`,
  };
  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Sheets webhook failed:", res.status, await res.text());
    }
  } catch (err) {
    // Sheet write is best-effort; the Telegram admin message is the source of truth.
    console.error("Sheets webhook error:", err);
  }
}

async function finishApplication(ctx: BotContext): Promise<void> {
  const adminSummary = buildAdminSummary(ctx);
  // Build the applicant's final copy before resetSession clears the answers.
  const finalResult = [
    "✅ Rahmat! Arizangiz muvaffaqiyatli yuborildi.",
    "Tez orada siz bilan bog'lanamiz.",
    "",
    "📋 Yuborilgan arizangiz:",
    "",
    ...answerLines(ctx),
    "",
    "Yangi ariza yuborish uchun /start buyrug'ini yuboring.",
  ].join("\n");
  // Skip the admin copy when the admin tests the bot on themselves;
  // they already see the applicant-facing final summary in the same chat.
  const isAdminApplicant = String(ctx.from?.id) === adminChatId;
  if (!isAdminApplicant) {
    await ctx.api.sendMessage(adminChatId, adminSummary);
    if (ctx.session.cvFileId) {
      await ctx.api.sendDocument(adminChatId, ctx.session.cvFileId, {
        caption: `CV — ${ctx.session.answers.fullName ?? "nomzod"}`,
      });
    }
  }
  await appendToSheet(ctx);
  resetSession(ctx);
  await ctx.reply(finalResult, { reply_markup: { remove_keyboard: true } });
}

async function cancelApplication(ctx: BotContext): Promise<void> {
  resetSession(ctx);
  await ctx.reply(
    "❌ Ariza bekor qilindi. Qaytadan boshlash uchun /start buyrug'ini yuboring.",
    { reply_markup: { remove_keyboard: true } },
  );
}

bot.command("start", async (ctx) => {
  resetSession(ctx);
  ctx.session.step = 0;
  await ctx.reply(
    "👋 NIS-Vacancy botiga xush kelibsiz!\n\n✨ Sizda oilamiz a’zosi bo‘lish uchun ajoyib imkoniyat bor!\n\nBiz sizdan ish arizangizni to‘ldirish uchun 12 ta oddiy savol so‘raymiz. Bu ko‘p vaqt olmaydi 🙂\n\nIstasangiz har qanday vaqtda /cancel bilan chiqib ketishingiz mumkin.\n\n⚠️ Diqqat: Ariza yuborish orqali siz ma’lumotlaringiz to‘g‘ri ekanini tasdiqlaysiz.",
  );
  await askCurrentStep(ctx);
});

bot.command("cancel", async (ctx) => {
  await cancelApplication(ctx);
});

bot.command("skip", async (ctx) => {
  // /skip is only meaningful on the optional CV step.
  if (ctx.session.step !== CV_STEP) {
    await ctx.reply(
      "Hozir o'tkazib yuboradigan savol yo'q. Boshlash uchun /start buyrug'ini yuboring.",
    );
    return;
  }
  ctx.session.step = CONFIRM_STEP;
  await askCurrentStep(ctx);
});

// Contact button answers the phone step.
bot.on("message:contact", async (ctx) => {
  const step = ctx.session.step;
  if (step < 0 || step >= CV_STEP || STEPS[step].key !== "phone") return;
  ctx.session.answers.phone = ctx.message.contact.phone_number;
  ctx.session.step = step + 1;
  await ctx.reply("Qabul qilindi ✅", {
    reply_markup: { remove_keyboard: true },
  });
  await askCurrentStep(ctx);
});

// Document upload answers the CV step.
bot.on("message:document", async (ctx) => {
  if (ctx.session.step !== CV_STEP) {
    await ctx.reply("Avval /start buyrug'i bilan arizani boshlang.");
    return;
  }
  ctx.session.cvFileId = ctx.message.document.file_id;
  ctx.session.cvFileName = ctx.message.document.file_name ?? "CV";
  ctx.session.step = CONFIRM_STEP;
  await askCurrentStep(ctx);
});

// Plain text answers the current question.
bot.on("message:text", async (ctx) => {
  const step = ctx.session.step;
  if (step === -1) {
    await ctx.reply(
      "NIS-Vacancy arizasini boshlash uchun /start buyrug'ini yuboring.",
    );
    return;
  }
  const text = ctx.message.text.trim();

  if (step === CV_STEP) {
    if (text === SKIP_TEXT) {
      ctx.session.step = CONFIRM_STEP;
      await askCurrentStep(ctx);
      return;
    }
    await ctx.reply(
      "Iltimos, CV faylini yuboring yoki CVsiz davom etish uchun quyidagi tugmani bosing.",
      { reply_markup: skipKeyboard },
    );
    return;
  }
  if (step === CONFIRM_STEP) {
    if (text === CONFIRM_TEXT) {
      await finishApplication(ctx);
      return;
    }
    if (text === DECLINE_TEXT) {
      await cancelApplication(ctx);
      return;
    }
    await ctx.reply(
      "Iltimos, quyidagi tugmalardan birini tanlang.",
      { reply_markup: confirmKeyboard },
    );
    return;
  }
  const current = STEPS[step];
  const error = current.validate?.(text);
  if (error) {
    await ctx.reply(
      error,
      current.keyboard ? { reply_markup: current.keyboard } : undefined,
    );
    return;
  }
  if (text.length < 1) {
    await ctx.reply("Javob bo'sh bo'lmasligi kerak — iltimos, qaytadan yozing.");
    return;
  }
  ctx.session.answers[current.key] = text;
  ctx.session.step = step + 1;
  if (current.key === "phone") {
    await ctx.reply("Qabul qilindi ✅", {
      reply_markup: { remove_keyboard: true },
    });
  }
  await askCurrentStep(ctx);
});

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

export async function registerBotCommands(): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Yangi ariza boshlash" },
    { command: "cancel", description: "Joriy arizani bekor qilish" },
  ]);
}
