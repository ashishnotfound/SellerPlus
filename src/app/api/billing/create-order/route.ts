import { NextResponse } from "next/server";
import { createPaymentOrder } from "@/lib/razorpay";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    // Ensure user session is authenticated before creating payment orders
    await authenticateWithDevFallback(request);

    const body = await request.json();
    const { amount, receipt } = body;

    if (amount === undefined || !receipt) {
      return NextResponse.json({ error: "Amount and receipt are required" }, { status: 400 });
    }

    const order = await createPaymentOrder(Number(amount), receipt);

    if (!order) {
      return NextResponse.json({
        error: "Payment gateway is not configured. Please add Razorpay API keys in your environment to enable payments."
      }, { status: 501 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json({ error: authErr.body.error }, { status: authErr.status });
    }
    console.error("[Billing API] Order creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
