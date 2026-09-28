import { APP_NAME } from '@/config/app';

/** WhatsApp deep link with prefilled text (wa.me works on phones and WhatsApp Web). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function inviteMessage(groupName: string, link: string): string {
  return `Join “${groupName}” on ${APP_NAME} so we can split expenses. Tap to join, no sign-up needed: ${link}`;
}

export function claimMessage(
  name: string,
  groupName: string,
  link: string,
  reclaim: boolean,
): string {
  return reclaim
    ? `${name}, here’s your link to get back into “${groupName}” on ${APP_NAME} on this phone. It works once: ${link}`
    : `${name}, your spot in “${groupName}” on ${APP_NAME} is ready and your balance is already there. Tap to claim it: ${link}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
