import nodemailer from "nodemailer";

const configured = !!process.env.SMTP_HOST;
const transport = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    // Sin SMTP configurado (desarrollo): se imprime en la consola del servidor.
    console.log(`\n[correo no enviado · configura SMTP_HOST]\nPara: ${to}\nAsunto: ${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: process.env.SMTP_FROM ?? "Redekorate <no-reply@localhost>", to, subject, text });
}
