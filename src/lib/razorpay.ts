import type Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

let razorpay: Razorpay | null = null;
if (typeof window === "undefined" && keyId && keySecret) {
  try {
    // Dynamic import only on server side
    const RazorpayModule = require("razorpay");
    razorpay = new RazorpayModule({ key_id: keyId, key_secret: keySecret });
  } catch {
    razorpay = null;
  }
}

export interface RazorpayOrderPayload {
  amount: number; // in paise
  currency: string;
  receipt: string;
  payment_capture?: number;
}

export async function createPaymentOrder(amount: number, receiptId: string): Promise<{ id: string; amount: number; currency: string } | null> {
  if (!razorpay) {
    // Payment gateway not configured
    return null;
  }

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay takes amount in paise
      currency: "INR",
      receipt: receiptId,
      payment_capture: true, // Auto-capture payments
    });
    return {
      id: order.id,
      amount: typeof order.amount === "string" ? parseInt(order.amount, 10) : order.amount,
      currency: order.currency,
    };
  } catch (error) {
    console.error("Razorpay Order Creation Error:", error);
    return null;
  }
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!keySecret) {
    // Payment gateway not configured — cannot verify
    return false;
  }

  try {
    const crypto = require("crypto");
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentId)
      .digest("hex");

    return generatedSignature === signature;
  } catch {
    return false;
  }
}
