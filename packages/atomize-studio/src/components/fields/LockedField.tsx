export function LockedField(props: { label: string; value: string; note: string }) {
  return (
    <div class="ui-field">
      <div class="ui-label">{props.label}</div>
      <div class="locked-field">
        <span class="locked-value">{props.value}</span>
        <span class="locked-note">{props.note}</span>
      </div>
    </div>
  );
}
