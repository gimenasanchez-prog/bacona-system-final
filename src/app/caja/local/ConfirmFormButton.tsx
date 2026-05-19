"use client";

export function ConfirmFormButton(props: {
  message: string;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={props.className}
      onClick={(e) => {
        if (!confirm(props.message)) e.preventDefault();
      }}
    >
      {props.label}
    </button>
  );
}
