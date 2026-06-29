import { Image } from "@shopify/ui-extensions-react/checkout";
import { tWithArgs } from "../utils/i18n";

type Props = { qrImageUrl: string | undefined; amount: number; locale: string };

export function QRDisplay({ qrImageUrl, amount, locale }: Props) {
  if (!qrImageUrl) return null;
  const formattedAmount = new Intl.NumberFormat("vi-VN").format(amount);
  const altText = tWithArgs("qrAltText", locale, formattedAmount);
  console.log("[Tingee] QRDisplay source:", qrImageUrl);
  return <Image source={qrImageUrl} accessibilityDescription={altText} />;
}
