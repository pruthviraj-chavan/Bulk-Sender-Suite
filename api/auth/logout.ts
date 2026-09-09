import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearAuthCookie } from "../../server/auth-cookie";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  clearAuthCookie(res);
  return res.status(200).json({ success: true });
}