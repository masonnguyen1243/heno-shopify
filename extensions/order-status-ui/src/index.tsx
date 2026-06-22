import {
  reactExtension,
  useOrder,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order-status.block.render",
  () => <TingeePaymentBlock />
);

function TingeePaymentBlock() {
  const order = useOrder();

  // Placeholder — full implementation in Epic 2
  if (!order) return null;

  return null;
}
