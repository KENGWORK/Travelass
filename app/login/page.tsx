import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-4">
      <h1 className="font-heading text-[28px] leading-9 font-bold">TravelAss</h1>
      <p className="text-muted">วางแผนและบันทึกทริปของเรา</p>
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
        <button className="h-12 px-8 rounded-full bg-primary text-white font-semibold cursor-pointer transition-transform active:scale-[0.97]">
          เข้าสู่ระบบด้วย Google
        </button>
      </form>
    </main>
  );
}
