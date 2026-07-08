import {
  reactExtension,
  useApi,
  useSubscription,
  useLanguage,
  useTotalAmount,
} from "@shopify/ui-extensions-react/checkout";
import { PaymentCard } from "./components/PaymentCard";

export default reactExtension(
  "purchase.thank-you.block.render",
  () => <TingeePaymentBlock />
);

function TingeePaymentBlock() {
  const api = useApi<"purchase.thank-you.block.render">();
  const orderConfirmation = useSubscription(api.orderConfirmation);
  const language = useLanguage();
  const totalAmount = useTotalAmount();

  if (!orderConfirmation) return null;

  const amount = Math.round(totalAmount.amount);
  // order.id is a GID like "gid://shopify/Order/12345" — extract the numeric part
  const rawId = orderConfirmation.order.id;
  const orderId = rawId.includes("/") ? rawId.split("/").pop()! : rawId;
  const orderNumber = orderConfirmation.number ?? orderId;

  return (
    <PaymentCard
      orderId={orderId}
      amount={amount}
      orderNumber={orderNumber}
      locale={language?.isoCode ?? "en"}
    />
  );
}
