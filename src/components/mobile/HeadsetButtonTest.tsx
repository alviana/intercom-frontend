import { FC, useSyncExternalStore } from "react";
import {
  clearHeadsetLog,
  getHeadsetLog,
  subscribeHeadsetLog,
} from "../../mobile-overlay/headset-diagnostics";

const pad = (n: number) => String(n).padStart(2, "0");
const time = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const HeadsetButtonTest: FC = () => {
  const log = useSyncExternalStore(subscribeHeadsetLog, getHeadsetLog);
  const rows = [...log].reverse();

  return (
    <section style={{ marginTop: "2rem" }}>
      <h3>Teste do botão do fone</h3>
      <p>
        Entre numa linha e aperte o botão do fone. Cada aperto aparece aqui.
      </p>
      {rows.length === 0 ? (
        <p>Nenhum aperto recebido ainda.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rows.map((e, i) => (
            // append-only log: DOWN/UP can share ms and key, so index disambiguates
            // eslint-disable-next-line react/no-array-index-key
            <li key={`${e.at}-${i}`}>
              {time(e.at)} {e.key} {e.action} {e.result}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={clearHeadsetLog}>
        Limpar
      </button>
    </section>
  );
};
