# PRD Quality Review — Tingee Payment App

## Overall verdict

The PRD is **adequate-to-strong** for a Phase 1 Shopify payment integration: FRs are testable, the glossary is tight, and scope boundaries are explicit. Two significant gaps pull it below strong: (1) the reconciliation path for amount-mismatch is dangerously under-specified — it ends with "merchant xử lý thủ công" with no system support defined; and (2) the Static QR decision trades away reliable auto-confirmation, but the downstream UX and operational load implications are not fully surfaced for a decision-maker to weigh.

---

## 1. Decision-readiness — adequate

The PRD surfaces the Static QR trade-off (addendum DL-001/DL-002) and the SePay window-of-opportunity clearly. The Shopify Payments Partner revenue-share terms in the addendum are a useful signal for a decision-maker. However, two trade-offs are incomplete:

### Findings

- **high** Static QR mismatch operational cost not quantified (§4.4 / addendum) — The PRD acknowledges MBBank and similar apps let users edit amounts, then defers mismatches to "merchant manual handling". There is no estimate of what mismatch rate to expect or what operational burden that implies. A decision-maker cannot judge whether Static QR is the right call without even a rough baseline. *Fix:* Add a 1-paragraph risk note: estimated mismatch rate from Tingee pilot data (or competitor data), estimated merchant handling time per incident, and the trigger condition that would force a switch to Dynamic QR.

- **medium** Phase 2 approval timeline risk not surfaced in Phase 1 decision (§1, addendum) — The addendum notes the Shopify Payments Partner path takes 4–12 weeks, requires PCI DSS compliance, and results in "Hidden" status. Phase 1 merchants are promised a future checkout-modal flow. If Phase 2 approval fails or takes >12 months, the Phase 1 workaround (Order Status page only) may become permanent. This risk is not called out in the PRD body. *Fix:* Add a sentence in §1 or §5 noting Phase 2 is contingent on Shopify approval; set expectation for merchant communication if Phase 2 slips.

- **medium** No rollback / emergency kill-switch decision (§8 NFR) — What happens if a Tingee API outage causes the checkout page to become unusable? There is no stated behavior (e.g., hide the payment method automatically, fallback message). *Fix:* Add one testable NFR: "If Tingee credential validation or QR generation fails at order time, the Order Status Extension displays a fallback message instructing the buyer to contact the merchant."

- **low** SM-4 (100 installs in 6 months) has no measurement plan (§7) — The metric is listed with no owner, no tracking mechanism, and no action threshold. *Fix:* Note the data source (Shopify Partner Dashboard) and what action is triggered if the target is not on track at 3 months.

---

## 2. Substance over theater — strong

The persona vignettes in UJ-1 through UJ-4 are functional rather than decorative — each has a specific entry state, climax, and edge case. The NFR section has concrete numbers (AES-256, HMAC-SHA512, 5s webhook timeout, 500ms render budget, rate-limit threshold). The glossary terms are earned; every term defined in §3 appears in FRs. No NFR theater detected.

### Findings

- **low** UJ-4 persona is thin (§2.3 UJ-4) — The amount-mismatch journey has no named persona and no entry context beyond "người mua vô tình sửa số tiền". Given this is the highest-risk flow for merchant trust, a minimal persona with context (which bank, what device) would ground subsequent edge-case work. *Fix:* Add 1-sentence persona context to UJ-4.

- **low** Vision paragraph (§1) mentions "không cần viết code, không cần giải pháp bên thứ ba" — both are partially false for Phase 1 (merchant needs a Tingee account and credentials, the UX spec documents non-trivial setup steps). The phrasing is marketing, not a product commitment. *Fix:* Qualify: "không cần viết code thêm" rather than implying zero prerequisites.

---

## 3. Strategic coherence — strong

The PRD has a clear thesis: replace ScriptTag-based competitors on the Order Status page before the August 2026 forced migration, using the official Shopify Checkout UI Extension API. Every FR serves either merchant onboarding, buyer payment flow, or reconciliation — none are orphaned features. The Phase 1 / Phase 2 boundary is coherent (Manual Payment Method now, Shopify Payments Partner later).

### Findings

- **low** The addendum long-term vision (§ "Tầm nhìn dài hạn") mentions Virtual Account, Direct Debit, Subscription, and Southeast Asia expansion. None of these appear in §5 Non-Goals or §6 Out of Scope. A reader could interpret them as Phase 3 commitments rather than aspirations. *Fix:* Add a brief note in §5 or §6: "Virtual Account, Direct Debit, Subscription, and SEA expansion are aspirational directions beyond Phase 2 and carry no commitment in this document."

---

## 4. Done-ness clarity — adequate

Most FRs use testable outcome language ("trả HTTP 400", "retry 3 lần với exponential backoff 1s/5s/30s", "kích thước tối thiểu 200×200px"). However, several vague phrases remain and one FR is ambiguous enough to block story-writing.

### Findings

- **critical** FR-12: amount-mismatch path ends at Order Note with no "done" state for the system (§4.4 FR-12) — The testable outcome says the system adds an Order Note and holds `pending` status. There is no defined system action after this: no alert, no dashboard flag, no polling endpoint update for the buyer UI. An engineer implementing the reconciliation worker does not know when their work is done — is the pending state surfaced in the Order Status Extension? Does FR-10 polling return a "partial payment" state? *Fix:* Add a testable outcome: "When order is in `pending` mismatch state, FR-10 polling returns status `pending_review`; the Order Status Extension displays: 'Chúng tôi đã nhận được giao dịch nhưng số tiền chưa khớp. Vui lòng liên hệ cửa hàng.'"

- **high** FR-8: "nội dung chuyển khoản gợi ý" (§4.3 FR-8) — The format `TINGEE {order_number}` is specified, but there is no stated maximum length constraint, no character-set constraint (accents? special chars?), and no behavior if `order_number` exceeds bank field limits. Bank transfer memo fields are typically 50–70 characters. *Fix:* Add: "nội dung chuyển khoản tối đa 50 ký tự, ASCII only."

- **high** FR-3: "lưu Credential được mã hóa" (§4.2 FR-3) — The NFR says AES-256; FR-3 says "lưu mã hóa tại backend" without naming the algorithm or the key management approach. The testable outcome does not include how the encryption is verified. *Fix:* Cross-reference NFR §8 explicitly in FR-3 and add: "Encryption key is stored separately from the database (e.g., environment variable or secrets manager)."

- **medium** FR-10 polling: "cho đến khi đơn chuyển sang Paid hoặc QR hết hạn (15 phút)" — no behavior specified if the tab is backgrounded, page is refreshed, or buyer navigates away and returns. *Fix:* Add: "Polling resumes on page focus/visibility; a returned-to page within 15 minutes resumes from remaining countdown."

- **medium** FR-13: "đơn được đánh dấu cần xử lý thủ công" (§4.4 FR-13) — where is this flag? In Shopify Admin (Order Note? Tag? Metafield?)? An engineer needs a concrete implementation target. *Fix:* Specify: "Order receives Shopify tag `tingee-retry-failed` and an Order Note with timestamp and error details."

- **low** FR-4: "Nếu đăng ký thất bại: Admin Surface hiển thị cảnh báo và hướng dẫn thử lại" (§4.2 FR-4) — "hướng dẫn thử lại" is vague. Does this mean a retry button, a link to support docs, or just text? *Fix:* Specify the UI element: "display a Banner component with a 'Thử lại' button that re-triggers the registration call."

---

## 5. Scope honesty — strong

Non-Goals (§5) are doing real work: each entry explains *why* it is excluded or where the feature already lives. ASSUMPTION tags are present in the body at the point of use and indexed in §11 with risk statements. §6 scope list matches the FR set with no orphan inclusions.

### Findings

- **medium** ASSUMPTION in UJ-4 (§2.3 UJ-4) is not indexed in §11 (§2.3 / §11) — UJ-4 contains `[ASSUMPTION: merchant nhận thông báo email hoặc thấy flag trong Shopify Admin]` which is never referenced in the §11 Assumptions Index. This assumption is load-bearing: it determines whether merchants will ever act on mismatch orders. *Fix:* Add to §11: "[ASSUMPTION] UJ-4 / FR-12 — Merchant nhận biết pending order qua Order Note trong Shopify Admin mà không cần thông báo proactive. *Nếu merchant không thường xuyên check Admin, các đơn mismatch có thể bị bỏ sót. Đây là trigger cho SM-C1 monitoring.*"

- **low** §10 "Không còn open question nào" is overconfident (§10) — At minimum, the Tingee Deeplink API SLA (ASSUMPTION FR-9 in §11) and the mismatch rate baseline are open questions awaiting confirmation from Tingee team. Declaring zero open questions overstates certainty. *Fix:* Replace with: "Open questions awaiting Tingee team confirmation: (1) Deeplink API production SLA; (2) typical Static QR mismatch rate from existing merchant data."

---

## 6. Downstream usability — adequate

The glossary is consistent and well-used. FR IDs are mostly contiguous (FR-1 through FR-14). Cross-references from UJ to FR (via section headers) are implicit but resolvable. Two mechanical issues reduce usability for story-writing.

### Findings

- **high** FR-10b numbering breaks contiguous ID sequence (§4.3 FR-10b) — FR-10b is not a standard ID form; it will break any tooling or story-mapping that expects FR-10, FR-11 to be adjacent. The QR expiry behavior is substantively different from polling and deserves its own clean ID. *Fix:* Renumber FR-10b as FR-15 and update all cross-references.

- **medium** UJ-to-FR mapping is one-directional (§2.3, §4.x) — Section headers say "Realizes UJ-1" but UJ-1 does not list which FRs implement it. For story-writing this means a developer reading UJ-1 cannot find all its implementing FRs without scanning the full document. *Fix:* Add a one-line "Implemented by: FR-1, FR-3, FR-4" to each UJ, or add a traceability table as an appendix.

- **medium** SM IDs are listed in §7 but never cross-referenced from FRs (§7, §4.x) — SM-1 "Validates FR-1, FR-3, FR-4" appears in §7, but no FR references back to its validating SM. During story acceptance, engineers will not know which metrics their story impacts. *Fix:* Add `**Validates:** SM-X` to each FR that has a corresponding success metric.

- **low** "IPN" and "Webhook" are defined as near-synonyms in §3 but used interchangeably in §4.4 (Webhook handler section title vs. "IPN từ Tingee" in body). Pick one term for the implementation context. *Fix:* Use "Webhook" throughout §4.4 (IPN is the protocol; Webhook is the HTTP delivery mechanism — keep IPN in glossary as a definition of the concept, use Webhook in all FR outcomes).

---

## 7. Shape fit — strong

The PRD is pitched at the right abstraction level for a Shopify app feeding architecture and story decomposition. It specifies OAuth scopes, API versions, SDK package names, retry counts, timing thresholds, and visual minimum sizes — enough for an architect to make stack decisions and for a story-writer to cut 1-to-1 FR-to-story. It does not over-specify implementation (no class diagrams, no database schemas). The addendum correctly holds deployment and competitive context out of the main spec without losing it.

### Findings

- **low** §9 Dependencies table lacks version pins for Shopify Admin API beyond "≥ 2025-07" (§9) — For a compliance-sensitive app, the exact starting version matters for deprecation planning. *Fix:* Pin to `2025-07` as the minimum and note the upgrade cadence policy (Shopify requires apps to upgrade within 12 months of a version's deprecation date).

- **low** Shopify GDPR webhooks listed in NFR §8 but not mapped to any FR (§8) — The three GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are Shopify App Review requirements but have no FR, no testable outcome, and no story home. *Fix:* Add FR-15 (or FR-16 after FR-10b renumber) "GDPR webhook handlers" with testable outcomes for each of the three events.

---

## Mechanical notes

**Glossary drift:**
- "Pending" and "Paid" are defined in §3 with capital P. FR-12 uses lowercase `pending` in backtick code style, which is fine for technical context but inconsistent in prose. Standardize: use `pending` / `paid` in technical/code contexts, "Pending" / "Paid" in prose.
- "IPN" is defined in §3 but "Webhook" carries the implementation work; see §6 finding above.

**ID gaps:**
- FR-10b should be renumbered (see §6 finding). After renumber, sequence would be FR-1 through FR-15 with no gaps (assuming FR-15 = FR-10b and FR-16 = GDPR handler from §7 finding).
- SM-C1 is a counter-metric but has no numeric threshold defined — when is the pending rate "too high"? Suggest adding a threshold (e.g., "> 5% mismatch rate in a 7-day window triggers UX review").

**ASSUMPTION roundtrip:**
- §11 indexes 3 assumptions: FR-6/UJ-1, FR-7, FR-9. In-body tags: FR-4.1 (App Store assumption), FR-7 (UA detection), UJ-4 (merchant notification). The UJ-4 assumption is not in §11 (see §5 finding). FR-4.1 / §4.1 assumption ("App được list công khai") is indexed under "FR-6 / UJ-1" in §11 — the FR reference is inconsistent (should be FR-1 or §4.1, not FR-6). *Fix:* Correct the FR reference in the first §11 assumption to FR-1.

**Cross-reference issues:**
- §6.1 scope list items do not reference FR IDs, making it hard to audit completeness. Consider adding FR IDs in parentheses next to each scope item.
- DESIGN.md and EXPERIENCE.md are referenced in frontmatter and §4.3 description but no specific section anchors are given. If those documents change structure, the references become stale. *Fix:* Add section anchor hints (e.g., "See DESIGN.md §3 — Order Status Block layout").
