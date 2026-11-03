const paths = {
  user: "M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z",
  game: "M7 7h10c3 0 5 11 3 12-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 18 4 7 7 7ZM7 10v5M4.5 12.5h5M16 11h.01M19 14h.01",
  mail: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};
export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function ProviderIcon({ id }: { id: string }) {
  return (
    <span class={`provider-icon provider-${id}`} aria-hidden="true">
      {id === "microsoft" ? <><i /><i /><i /><i /></> : id === "google" ? "G" : id === "twitter" ? "𝕏" : <Icon name="user" />}
    </span>
  );
}
