import { useState } from "react";
import {
  Page,
  Card,
  TextField,
  Button,
  Badge,
  Banner,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { HideIcon, ViewIcon } from "@shopify/polaris-icons";

interface CredentialFormProps {
  hasCredential: boolean;
}

export function CredentialForm({ hasCredential }: CredentialFormProps) {
  const [clientId, setClientId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const isSaveDisabled = !clientId.trim() || !secretToken.trim();

  return (
    <Page title="Cài đặt Tingee Payment">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            {!hasCredential && (
              <Banner tone="info">
                Nhập Client ID và Secret Token từ portal Tingee để bắt đầu
              </Banner>
            )}
            <TextField
              label="Client ID"
              value={clientId}
              onChange={setClientId}
              autoComplete="off"
              placeholder={hasCredential ? "Nhập lại Client ID" : undefined}
              helpText={
                hasCredential
                  ? "Client ID đã được lưu — nhập lại để thay đổi"
                  : undefined
              }
            />
            <TextField
              label="Secret Token"
              type={showSecret ? "text" : "password"}
              value={secretToken}
              onChange={setSecretToken}
              autoComplete="off"
              placeholder={hasCredential ? "••••••••" : undefined}
              helpText={
                hasCredential
                  ? "Secret Token đã được lưu — nhập giá trị mới để thay đổi"
                  : undefined
              }
              suffix={
                <Button
                  variant="plain"
                  onClick={() => setShowSecret((v) => !v)}
                  icon={showSecret ? HideIcon : ViewIcon}
                  accessibilityLabel={
                    showSecret ? "Ẩn Secret Token" : "Hiện Secret Token"
                  }
                />
              }
            />
            <Button variant="primary" disabled={isSaveDisabled}>
              Lưu cài đặt
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Trạng thái kết nối
            </Text>
            {hasCredential ? (
              <Badge tone="success">Đã kết nối</Badge>
            ) : (
              <Badge tone="critical">Chưa kết nối</Badge>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
