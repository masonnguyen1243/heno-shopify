import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import {
  Page,
  Card,
  TextField,
  Button,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Spinner,
  Modal,
} from "@shopify/polaris";
import { HideIcon, ViewIcon } from "@shopify/polaris-icons";

interface CredentialFormProps {
  hasCredential: boolean;
}

type ActionData = { success?: boolean; error?: string; deleted?: boolean } | undefined;

export function CredentialForm({ hasCredential }: CredentialFormProps) {
  const fetcher = useFetcher<ActionData>();
  const [clientId, setClientId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [localHasCredential, setLocalHasCredential] = useState(hasCredential);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isSubmitting = fetcher.state === "submitting";
  const saveResult = fetcher.data;
  const isDeleting =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

  useEffect(() => {
    if (saveResult?.success) {
      setLocalHasCredential(true);
      setClientId("");
      setSecretToken("");
      dismissTimerRef.current = setTimeout(() => {
        fetcher.load("/app/settings");
      }, 5000);
    }
    return () => clearTimeout(dismissTimerRef.current);
  }, [saveResult?.success]);

  useEffect(() => {
    if (saveResult?.deleted) {
      setLocalHasCredential(false);
      setShowDeleteModal(false);
      setClientId("");
      setSecretToken("");
    }
  }, [saveResult?.deleted]);

  const errorMessage =
    saveResult?.error === "INVALID_CREDENTIALS"
      ? "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee."
      : saveResult?.error === "TINGEE_TIMEOUT"
        ? "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại."
        : saveResult?.error === "MISSING_FIELDS"
          ? "Vui lòng nhập Client ID và Secret Token."
          : saveResult?.error === "PAYMENT_METHOD_REGISTRATION_FAILED"
            ? "Credentials đã được lưu nhưng không thể đăng ký phương thức thanh toán với Shopify. Vui lòng thử lại."
            : saveResult?.error === "PAYMENT_METHOD_UNREGISTRATION_FAILED"
              ? "Không thể hủy đăng ký phương thức thanh toán với Shopify. Credential chưa bị xóa. Vui lòng thử lại."
              : saveResult?.error === "CREDENTIAL_DELETION_FAILED"
                ? "Phương thức thanh toán đã được hủy đăng ký khỏi Shopify nhưng không thể xóa credential khỏi hệ thống. Vui lòng thử lại."
                : saveResult?.error
                  ? "Đã xảy ra lỗi khi lưu cài đặt. Vui lòng thử lại."
                  : null;

  const isSaveDisabled =
    isSubmitting || isDeleting || !clientId.trim() || !secretToken.trim();

  return (
    <Page title="Cài đặt Tingee Payment">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            {saveResult?.success && (
              <Banner tone="success">Đã kết nối thành công với Tingee</Banner>
            )}
            {errorMessage && (
              <Banner tone="critical">{errorMessage}</Banner>
            )}
            {!localHasCredential && !saveResult?.success && (
              <Banner tone="info">
                Nhập Client ID và Secret Token từ portal Tingee để bắt đầu
              </Banner>
            )}

            <fetcher.Form method="post">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="secretToken" value={secretToken} />

              <BlockStack gap="400">
                <TextField
                  label="Client ID"
                  value={clientId}
                  onChange={setClientId}
                  autoComplete="off"
                  disabled={isSubmitting}
                  placeholder={localHasCredential ? "Nhập lại Client ID" : undefined}
                  helpText={
                    localHasCredential
                      ? "Client ID đã được lưu — nhập lại để thay đổi"
                      : undefined
                  }
                  maxLength={255}
                />
                <TextField
                  label="Secret Token"
                  type={showSecret ? "text" : "password"}
                  value={secretToken}
                  onChange={setSecretToken}
                  autoComplete="off"
                  disabled={isSubmitting}
                  placeholder={localHasCredential ? "••••••••" : undefined}
                  helpText={
                    localHasCredential
                      ? "Secret Token đã được lưu — nhập giá trị mới để thay đổi"
                      : undefined
                  }
                  maxLength={255}
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
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    disabled={isSaveDisabled}
                    loading={isSubmitting}
                    submit
                  >
                    Lưu cài đặt
                  </Button>
                  {localHasCredential && (
                    <Button
                      tone="critical"
                      disabled={isSubmitting || isDeleting}
                      loading={isDeleting}
                      onClick={() => setShowDeleteModal(true)}
                    >
                      Xóa Credential
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </fetcher.Form>

            <Modal
              open={showDeleteModal}
              onClose={() => setShowDeleteModal(false)}
              title="Xóa Credential Tingee"
              primaryAction={{
                content: "Xóa",
                destructive: true,
                loading: isDeleting,
                onAction: () => {
                  if (isDeleting) return;
                  fetcher.submit({ intent: "delete" }, { method: "post" });
                },
              }}
              secondaryActions={[
                {
                  content: "Hủy",
                  onAction: () => setShowDeleteModal(false),
                },
              ]}
            >
              <Modal.Section>
                <Text as="p">
                  Xóa Credential sẽ hủy đăng ký phương thức thanh toán "Thanh toán qua Tingee QR" khỏi cửa hàng của bạn. Người mua sẽ không còn thấy tùy chọn này tại checkout.
                </Text>
              </Modal.Section>
            </Modal>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Trạng thái kết nối
            </Text>
            {isSubmitting ? (
              <Spinner size="small" />
            ) : localHasCredential || saveResult?.success ? (
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
