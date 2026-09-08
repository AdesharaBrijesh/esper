import { LoginForm } from "@/components/auth/login-form";
import { APP_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-md shadow-primary/30">
            ₹
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your money tracker</p>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
