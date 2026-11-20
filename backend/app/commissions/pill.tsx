/* The status of a commission, as a coloured label. */
const STATUS: Record<string, [string, string]> = {
  open: ["ok", "Open"], assigned: ["info", "In progress"], delivered: ["warn", "Delivered"], done: ["ok", "Done"],
  disputed: ["warn", "In dispute"], cancelled: ["info", "Cancelled"], refunded: ["info", "Reward returned"],
};
export const CommPill = ({ status }: { status: string }) => <span className={`pill ${STATUS[status]?.[0] ?? "info"}`}>{STATUS[status]?.[1] ?? status}</span>;
