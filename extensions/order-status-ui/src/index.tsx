import {
  reactExtension,
  useOrder,
  useLanguage,
} from "@shopify/ui-extensions-react/customer-account";
import { PaymentCard } from "./components/PaymentCard";

export default reactExtension(
  "customer-account.order-status.block.render",
  () => <TingeePaymentBlock />
);

function TingeePaymentBlock() {
  const order = useOrder();
  const language = useLanguage();

  if (!order) return null;

  const isTingeePayment =
    order.paymentGatewayNames?.includes("Thanh toán qua Tingee QR");
  if (!isTingeePayment) return null;

  const amount = order.totalPrice?.amount
    ? Math.round(parseFloat(order.totalPrice.amount))
    : 0;
  const orderNumber = order.name ?? order.id;
  const orderId = order.id;

  return (
    <PaymentCard
      orderId={orderId}
      amount={amount}
      orderNumber={orderNumber}
      locale={language?.isoCode ?? "en"}
      financialStatus={order.financialStatus}
    />
  );
}
