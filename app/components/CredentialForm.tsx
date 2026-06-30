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
  Select,
} from "@shopify/polaris";
import { HideIcon, ViewIcon } from "@shopify/polaris-icons";

interface SavedAccount {
  accountNumber: string;
  bankBin: string;
  bankName: string;
}

interface CredentialFormProps {
  hasCredential: boolean;
  savedAccount: SavedAccount | null;
}

type TingeeBankAccount = {
  accountNumber: string;
  vaAccountNumber: string;
  bankBin: string;
  bankName: string;
  accountName: string;
};

type ActionData =
  | {
      success?: boolean;
      error?: string;
      deleted?: boolean;
      verified?: boolean;
      accounts?: TingeeBankAccount[];
    }
  | undefined;

export function CredentialForm({ hasCredential, savedAccount }: CredentialFormProps) {
  const fetcher = useFetcher<ActionData>();
  const [clientId, setClientId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [localHasCredential, setLocalHasCredential] = useState(hasCredential);
  const [localSavedAccount, setLocalSavedAccount] = useState<SavedAccount | null>(savedAccount);
  const [selectedAccountKey, setSelectedAccountKey] = useState("");
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const actionData = fetcher.data;
  const isVerifying = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "verify";
  const isSaving = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "save";
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

  const verifiedAccounts: TingeeBankAccount[] = actionData?.verified ? (actionData.accounts ?? []) : [];

  useEffect(() => {
    if (actionData?.success) {
      setLocalHasCredential(true);
      const acc = verifiedAccounts.find((a) => `${a.bankBin}:${a.accountNumber}` === selectedAccountKey);
      if (acc) {
        setLocalSavedAccount({
          accountNumber: acc.accountNumber,
          bankBin: acc.bankBin,
          bankName: acc.bankName,
        });
      }
      setClientId("");
      setSecretToken("");
      setSelectedAccountKey("");
      dismissTimerRef.current = setTimeout(() => fetcher.load("/app/settings"), 5000);
    }
    return () => clearTimeout(dismissTimerRef.current);
  }, [actionData?.success]);

  useEffect(() => {
    if (actionData?.deleted) {
      setLocalHasCredential(false);
      setLocalSavedAccount(null);
      setShowDeleteModal(false);
      setClientId("");
      setSecretToken("");
      setSelectedAccountKey("");
    }
  }, [actionData?.deleted]);

  // Pre-select first account when list arrives
  useEffect(() => {
    if (verifiedAccounts.length > 0 && !selectedAccountKey) {
      setSelectedAccountKey(`${verifiedAccounts[0].bankBin}:${verifiedAccounts[0].accountNumber}`);
    }
  }, [verifiedAccounts.length]);

  const errorMessage =
    actionData?.error === "INVALID_CREDENTIALS"
      ? "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee."
      : actionData?.error === "TINGEE_TIMEOUT"
        ? "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại."
        : actionData?.error === "MISSING_FIELDS"
          ? "Vui lòng nhập Client ID và Secret Token."
          : actionData?.error === "MISSING_ACCOUNT"
            ? "Vui lòng chọn tài khoản ngân hàng."
            : actionData?.error === "CREDENTIAL_DELETION_FAILED"
              ? "Không thể xóa credential. Vui lòng thử lại."
              : actionData?.error
                ? "Đã xảy ra lỗi. Vui lòng thử lại."
                : null;

  const isVerifyDisabled = isVerifying || isSaving || !clientId.trim() || !secretToken.trim();
  const isSaveDisabled = isSaving || !selectedAccountKey;

  const accountOptions = verifiedAccounts.map((a) => ({
    label: `${a.bankName || a.bankBin} — ${a.accountNumber}${a.accountName ? ` (${a.accountName})` : ""}`,
    value: `${a.bankBin}:${a.accountNumber}`,
  }));

  const selectedAccount = verifiedAccounts.find(
    (a) => `${a.bankBin}:${a.accountNumber}` === selectedAccountKey
  );

  return (
    <Page title="Cài đặt Tingee Payment">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            {actionData?.success && (
              <Banner tone="success">Đã kết nối thành công với Tingee</Banner>
            )}
            {actionData?.verified && verifiedAccounts.length === 0 && (
              <Banner tone="warning">
                Xác minh thành công nhưng không tìm thấy tài khoản VA nào. Hãy thiết lập tài khoản trong{" "}
                <a href="https://portal.tingee.vn" target="_blank" rel="noreferrer">portal Tingee</a> rồi thử lại.
              </Banner>
            )}
            {errorMessage && <Banner tone="critical">{errorMessage}</Banner>}
            {!localHasCredential && !actionData?.verified && !actionData?.success && (
              <Banner tone="info">
                Nhập Client ID và Secret Token từ portal Tingee để bắt đầu
              </Banner>
            )}
            {actionData?.verified && verifiedAccounts.length > 0 && (
              <Banner tone="success">
                Xác minh thành công! Chọn tài khoản nhận thanh toán bên dưới.
              </Banner>
            )}
            {(localHasCredential || actionData?.success) && (
              <Banner tone="info" title="Thiết lập phương thức thanh toán">
                Để khách hàng thấy tùy chọn Tingee QR tại checkout, hãy thêm thủ công một lần trong Shopify Admin:{" "}
                <strong>Settings → Payments → Manual payment methods → Add manual payment method</strong>,
                đặt tên <strong>"Thanh toán qua Tingee QR"</strong>.
              </Banner>
            )}

            {/* Step 1: Enter credentials and verify */}
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="verify" />
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="secretToken" value={secretToken} />
              <BlockStack gap="400">
                <TextField
                  label="Client ID"
                  value={clientId}
                  onChange={setClientId}
                  autoComplete="off"
                  disabled={isVerifying || isSaving}
                  placeholder={localHasCredential ? "Nhập lại Client ID" : undefined}
                  helpText={localHasCredential ? "Client ID đã được lưu — nhập lại để thay đổi" : undefined}
                  maxLength={255}
                />
                <TextField
                  label="Secret Token"
                  type={showSecret ? "text" : "password"}
                  value={secretToken}
                  onChange={setSecretToken}
                  autoComplete="off"
                  disabled={isVerifying || isSaving}
                  placeholder={localHasCredential ? "••••••••" : undefined}
                  helpText={localHasCredential ? "Secret Token đã được lưu — nhập giá trị mới để thay đổi" : undefined}
                  maxLength={255}
                  suffix={
                    <Button
                      variant="plain"
                      onClick={() => setShowSecret((v) => !v)}
                      icon={showSecret ? HideIcon : ViewIcon}
                      accessibilityLabel={showSecret ? "Ẩn Secret Token" : "Hiện Secret Token"}
                    />
                  }
                />
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    disabled={isVerifyDisabled}
                    loading={isVerifying}
                    submit
                  >
                    Xác minh
                  </Button>
                  {localHasCredential && (
                    <Button
                      tone="critical"
                      disabled={isVerifying || isSaving || isDeleting}
                      loading={isDeleting}
                      onClick={() => setShowDeleteModal(true)}
                    >
                      Xóa Credential
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </fetcher.Form>

            {/* Step 2: Select VA account (shown after successful verify with accounts) */}
            {actionData?.verified && verifiedAccounts.length > 0 && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="save" />
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="secretToken" value={secretToken} />
                <input type="hidden" name="accountNumber" value={selectedAccount?.accountNumber ?? ""} />
                <input type="hidden" name="vaAccountNumber" value={selectedAccount?.vaAccountNumber ?? ""} />
                <input type="hidden" name="bankBin" value={selectedAccount?.bankBin ?? ""} />
                <input type="hidden" name="bankName" value={selectedAccount?.bankName ?? ""} />
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">Chọn tài khoản nhận thanh toán</Text>
                  <Select
                    label="Tài khoản ngân hàng"
                    options={accountOptions}
                    value={selectedAccountKey}
                    onChange={setSelectedAccountKey}
                    disabled={isSaving}
                  />
                  <Button
                    variant="primary"
                    disabled={isSaveDisabled}
                    loading={isSaving}
                    submit
                  >
                    Lưu cài đặt
                  </Button>
                </BlockStack>
              </fetcher.Form>
            )}

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
              secondaryActions={[{ content: "Hủy", onAction: () => setShowDeleteModal(false) }]}
            >
              <Modal.Section>
                <Text as="p">
                  Xóa Credential sẽ ngắt kết nối tài khoản Tingee khỏi ứng dụng. Bạn cũng cần tự xóa phương thức thanh toán "Thanh toán qua Tingee QR" trong Shopify Admin → Settings → Payments.
                </Text>
              </Modal.Section>
            </Modal>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Trạng thái kết nối</Text>
            {isVerifying || isSaving ? (
              <Spinner size="small" />
            ) : localHasCredential || actionData?.success ? (
              <BlockStack gap="200">
                <Badge tone="success">Đã kết nối</Badge>
                {localSavedAccount && (
                  <Text as="p" tone="subdued">
                    {localSavedAccount.bankName
                      ? `${localSavedAccount.bankName} — ${localSavedAccount.accountNumber}`
                      : localSavedAccount.accountNumber}
                  </Text>
                )}
              </BlockStack>
            ) : (
              <Badge tone="critical">Chưa kết nối</Badge>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
