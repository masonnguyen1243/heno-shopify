import { Button } from "@shopify/ui-extensions-react/checkout";
import { t } from "../utils/i18n";

type Props = { deeplinkUrl: string | null; locale: string };

export function DeeplinkButton({ deeplinkUrl, locale }: Props) {
  if (!deeplinkUrl) return null;
  return (
    <Button to={deeplinkUrl} kind="secondary">
      {t("openBankApp", locale)}
    </Button>
  );
}
