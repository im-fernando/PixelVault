import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConsoleGameStatus } from '../console/ConsoleGameStatus.js';
import { guardarBiosPs1, lerBiosPs1, validarBiosPs1 } from './ps1-bios.js';
import '../console/console-player.css';
import '../console/console.css';

/** A escolha acontece antes de criar o core, também no modo console. */
export function Ps1Setup({
  titulo,
  sair,
  children,
  modoConsole = false,
}: {
  titulo: string;
  sair: () => void;
  children: ReactNode;
  modoConsole?: boolean;
}) {
  const [iniciado, setIniciado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [persistido, setPersistido] = useState(true);
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelado = false;
    void lerBiosPs1()
      .then((bios) => {
        if (!cancelado) setNome(bios?.fileName ?? null);
      })
      .catch(() => {
        if (!cancelado) {
          setPersistido(false);
          setErro('Não foi possível ler a BIOS guardada. Escolha uma BIOS ou continue com HLE.');
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  if (iniciado) return children;
  return (
    <div className="console-experience" data-console-theme="aurora">
      <ConsoleGameStatus
        titulo={titulo}
        sobrelinha="ANTES DE JOGAR · PLAYSTATION"
        rotuloDeSaida={modoConsole ? 'Voltar ao console' : 'Voltar à biblioteca'}
        sair={sair}
        detalhe="Controle digital · CHD/ISO de um CD ou homebrew PS-X EXE"
        tentar={
          carregando
            ? undefined
            : () => {
                // Se o armazenamento falhou, tornar explícita a escolha HLE na sessão.
                if (!nome) void guardarBiosPs1(null);
                setIniciado(true);
              }
        }
        rotuloDaAcao={nome ? 'Iniciar jogo' : 'Iniciar com BIOS HLE'}
      >
        <div className="ps1-setup">
          <p>
            {nome
              ? `BIOS: ${nome}`
              : 'Sem BIOS própria: HLE tem compatibilidade menor; alguns jogos e saves podem falhar.'}
          </p>
          <p>A BIOS fica neste navegador e não é enviada à sua conta.</p>
          <input
            ref={arquivo}
            hidden
            type="file"
            accept=".bin"
            aria-label="Arquivo de BIOS de PS1"
            onChange={(evento) => {
              const file = evento.target.files?.[0];
              evento.target.value = '';
              if (!file) return;
              setCarregando(true);
              setErro(null);
              void (async () => {
                if (file.size !== 512 * 1024) throw new Error('A BIOS deve ter 512 KiB.');
                const bytes = new Uint8Array(await file.arrayBuffer());
                validarBiosPs1(file.name, bytes);
                const fileName = /^psxonpsp660/i.test(file.name)
                  ? 'PSXONPSP660.bin'
                  : file.name.toLowerCase();
                setPersistido(await guardarBiosPs1({ fileName, fileContent: bytes }));
                setNome(fileName);
              })()
                .catch((e: unknown) =>
                  setErro(e instanceof Error ? e.message : 'Não foi possível ler a BIOS.'),
                )
                .finally(() => setCarregando(false));
            }}
          />
          <button type="button" disabled={carregando} onClick={() => arquivo.current?.click()}>
            {nome ? 'Trocar BIOS' : 'Escolher BIOS de PS1'}
          </button>
          {nome && (
            <button
              type="button"
              disabled={carregando}
              onClick={() => {
                setCarregando(true);
                void guardarBiosPs1(null)
                  .then((salvo) => {
                    setPersistido(salvo);
                    setNome(null);
                  })
                  .finally(() => setCarregando(false));
              }}
            >
              Remover BIOS
            </button>
          )}
          {!persistido && <p role="status">Configuração válida apenas nesta sessão.</p>}
          {erro && <p role="alert">{erro}</p>}
          <p>
            ✕ Z · ○ X · □ A · △ S · L1 Q · R1 W · L2 E · R2 R<br />
            Menu: Select + Start ou Esc. Analógico esquerdo funciona como direcional.
          </p>
        </div>
      </ConsoleGameStatus>
    </div>
  );
}
