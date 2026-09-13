import { Link } from '@tanstack/react-router';
import { ArrowLeft, Trophy, Upload, User } from 'lucide-react';
import { usePreferenciaDeHome } from '../library/use-preferencia-de-home.js';
import { BotaoPilula, classesDaPilula } from '../../ui/Botao.js';
import { Painel } from '../../ui/Painel.js';
import { Sobrelinha, Verbete } from '../../ui/Texto.js';
import { useDefinirPerfilPublico, useSessao } from './sessao.js';

/**
 * A ficha da própria conta.
 *
 * Ela é deliberadamente curta: o que está nesta tela é o que o servidor já
 * sabe responder sobre a pessoa, mais os atalhos para o que é dela — o
 * perfil que os outros veem, as conquistas, a mesa de envio. Inventar aqui
 * um painel de coisas que ainda não existem (trocar senha, sessões ativas)
 * seria desenhar promessa.
 *
 * O estado `carregando` não é tratado aqui porque não chega até aqui: quem
 * decide é o `beforeLoad` da rota, que espera `/api/auth/me` antes de
 * renderizar qualquer coisa. Ver `rota-protegida.ts`.
 */
export function ConfiguracoesPage() {
  const sessao = useSessao();
  const definirPerfilPublico = useDefinirPerfilPublico();
  const { preferencia, definirCatalogoPublico } = usePreferenciaDeHome();

  if (sessao.estado !== 'autenticado') return null;
  const { usuario } = sessao;

  const atalho = classesDaPilula({ variante: 'secundaria', pequena: true });

  return (
    <div className="mx-auto max-w-[880px] pt-6">
      <Link to="/" className={atalho}>
        <ArrowLeft size={14} /> Acervo
      </Link>

      <header className="mt-8">
        <Sobrelinha>sua conta</Sobrelinha>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <h1 className="titulo-cena text-[clamp(34px,4vw,60px)] text-label-100">
            {usuario.displayName}
          </h1>
          <span className="pv-chip">@{usuario.handle}</span>
        </div>
      </header>

      <Painel className="mt-8 p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Verbete rotulo="como aparece" valor={usuario.displayName} />
          <Verbete rotulo="e-mail" valor={usuario.email} />
          <Verbete rotulo="nº de conta" valor={usuario.id} maquina />
        </dl>
      </Painel>

      <nav aria-label="Atalhos da conta" className="mt-6 flex flex-wrap gap-3">
        <Link to="/u/$handle" params={{ handle: usuario.handle }} className={atalho}>
          <User size={14} /> Ver perfil público
        </Link>
        <Link to="/conquistas" className={atalho}>
          <Trophy size={14} /> Conquistas
        </Link>
        <Link to="/enviar-rom" className={atalho}>
          <Upload size={14} /> Enviar ROM
        </Link>
      </nav>

      <Painel className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[14px] font-medium text-label-100">Perfil público</p>
            <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
              {usuario.publicProfile
                ? `Qualquer pessoa que visitar /u/${usuario.handle} vê seu nome, conquistas e tempo de jogo — sem precisar de conta.`
                : `/u/${usuario.handle} responde 404 para quem visitar, do mesmo jeito que um handle que não existe.`}
            </p>
          </div>
          <BotaoPilula
            pequena
            variante="secundaria"
            disabled={definirPerfilPublico.isPending}
            onClick={() => definirPerfilPublico.mutate(!usuario.publicProfile)}
          >
            {usuario.publicProfile ? 'Desligar' : 'Ligar'}
          </BotaoPilula>
        </div>
      </Painel>

      <Painel className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[14px] font-medium text-label-100">Catálogo público na home</p>
            <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
              {preferencia.catalogoPublico
                ? 'A home mostra o homebrew que qualquer visitante vê, embaixo da sua biblioteca.'
                : 'A home mostra só o que é seu — sem a seção de catálogo público embaixo.'}
            </p>
            <p className="mt-2 text-[11.5px] text-ink-700">
              Fica só neste navegador — não é preferência da conta.
            </p>
          </div>
          <BotaoPilula
            pequena
            variante="secundaria"
            onClick={() => definirCatalogoPublico(!preferencia.catalogoPublico)}
          >
            {preferencia.catalogoPublico ? 'Desligar' : 'Ligar'}
          </BotaoPilula>
        </div>
      </Painel>

      <p className="mt-10 max-w-md text-[12.5px] leading-relaxed text-ink-500">
        Sua sessão vive num cookie que o JavaScript desta página não lê. Trocar de senha e ver onde
        você está logado chegam junto com o acervo pessoal.
      </p>
    </div>
  );
}
