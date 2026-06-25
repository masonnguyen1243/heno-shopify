export function formatVndAmount(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "decimal" }).format(amount) + " đ";
}
