import { useEffect, useState } from "react";
import { Trophy, Upload, X } from "lucide-react";
import type { Run, Trail } from "../types";
import { formatDelta, formatTime } from "../lib/analysis";
import {
  hasLeaderboard,
  loadLeaderboard,
  publishToLeaderboard,
  withdrawFromLeaderboard,
  type LeaderboardEntry,
} from "../lib/leaderboard";

interface Props {
  trail?: Trail;
  personalBest?: Run;
  riderName: string;
  /** Signed-in cloud rider id; the leaderboard is unavailable without one. */
  cloudUserId?: string;
}

export function Leaderboard({ trail, personalBest, riderName, cloudUserId }: Props) {
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const trailKey = trail?.id ?? "";
  const enabled = hasLeaderboard(trail) && Boolean(cloudUserId);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadLeaderboard(trailKey)
      .then((next) => {
        if (!active) return;
        setRows(next);
        setStatus("");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "Não foi possível carregar a classificação.");
      });
    return () => {
      active = false;
    };
  }, [enabled, trailKey, reload]);
  if (!trail || !hasLeaderboard(trail)) return null;
  const mine = rows?.find((row) => row.userId === cloudUserId);
  const leader = rows?.[0];
  const act = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      setStatus(done);
      setReload((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A classificação não respondeu.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel leaderboard-panel" aria-label={`Classificação de ${trail.name}`}>
      <div className="section-heading">
        <h2>
          <Trophy size={18} /> Classificação da pista
        </h2>
        {enabled && personalBest && (
          <div className="row-actions">
            <button
              className="button secondary compact"
              disabled={busy || personalBest.synthetic}
              title={personalBest.synthetic ? "As runs de demonstração não podem ser publicadas" : undefined}
              onClick={() =>
                void act(
                  () => publishToLeaderboard(trail, personalBest, riderName),
                  "O teu melhor tempo já está na classificação.",
                )
              }
            >
              <Upload size={14} /> {mine ? "Atualizar o meu tempo" : "Publicar o meu PB"}
            </button>
            {mine && (
              <button
                className="button secondary compact"
                disabled={busy}
                onClick={() =>
                  void act(() => withdrawFromLeaderboard(trail.id), "O teu tempo foi retirado.")
                }
              >
                <X size={14} /> Retirar
              </button>
            )}
          </div>
        )}
      </div>
      {!enabled ? (
        <p className="muted">
          Disponível com conta na nuvem.
        </p>
      ) : (
        <>
          <p className="muted">
            Opcional. Partilha o nome, o tempo e os setores; o traçado GPS não é partilhado.
          </p>
          {status && <p className="leaderboard-status" role="status">{status}</p>}
          {rows === null ? (
            <p className="muted" role="status">A carregar tempos…</p>
          ) : rows.length === 0 ? (
            <p className="muted">Ainda não há tempos. Sê o primeiro a publicar.</p>
          ) : (
            <ol className="leaderboard-list">
              {rows.map((row, index) => (
                <li key={row.userId} className={row.userId === cloudUserId ? "mine" : ""}>
                  <span className="leaderboard-rank mono">{index + 1}</span>
                  <span className="leaderboard-name">
                    {row.riderName}
                    <small className="muted">{row.runDate}</small>
                  </span>
                  <strong className="mono">{formatTime(row.bestSeconds)}</strong>
                  <span className="mono muted">
                    {leader && index > 0 ? formatDelta(row.bestSeconds - leader.bestSeconds) : "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
