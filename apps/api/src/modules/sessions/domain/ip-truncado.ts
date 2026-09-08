const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const GRUPO_IPV6 = /^[0-9a-f]{1,4}$/;
const PREFIXO_IPV4_MAPEADO = '::ffff:';

/**
 * Guarda o IP com a parte que identifica o assinante zerada. Ver
 * docs/adr/0017: a coluna serve para localização aproximada quando houver
 * abuso — "de que região veio esta sessão" — e não para saber onde a pessoa
 * mora. Guardar o IP inteiro seria coletar mais do que a finalidade exige,
 * o que a LGPD chama de minimização.
 *
 * IPv4 perde o último octeto (/24); IPv6 perde os últimos 80 bits (/48), que
 * é o bloco típico atribuído a um cliente residencial. Sobra a rede, some o
 * host.
 *
 * O que não der para reconhecer vira `null` — inventar um valor "quase certo"
 * para um formato desconhecido seria pior do que não guardar nada.
 */
export function truncarIp(ip: string | null | undefined): string | null {
  if (ip === null || ip === undefined) return null;

  const limpo = ip.trim().toLowerCase();
  if (limpo === '') return null;

  // `::ffff:189.0.0.1` é IPv4 vestido de IPv6 — o que o Node entrega quando
  // o socket é dual-stack. Truncar como IPv6 aqui zeraria justamente a
  // parte que é o endereço.
  const semMapeamento = limpo.startsWith(PREFIXO_IPV4_MAPEADO)
    ? limpo.slice(PREFIXO_IPV4_MAPEADO.length)
    : limpo;

  const v4 = IPV4.exec(semMapeamento);
  if (v4) {
    const octetos = v4.slice(1, 5).map(Number);
    if (octetos.some((octeto) => octeto > 255)) return null;
    return `${octetos.slice(0, 3).join('.')}.0`;
  }

  const grupos = primeirosTresGruposIpv6(limpo);
  return grupos === null ? null : `${grupos.join(':')}::`;
}

/**
 * Os três primeiros grupos (48 bits) de um IPv6, já normalizados sem zeros à
 * esquerda. `null` quando o texto não é um IPv6 que saibamos ler.
 */
function primeirosTresGruposIpv6(ipv6: string): string[] | null {
  const partes = ipv6.split('::');
  if (partes.length > 2) return null;

  const antesDaCompressao = partes[0] ?? '';
  const cabeca = antesDaCompressao === '' ? [] : antesDaCompressao.split(':');
  if (!cabeca.every((grupo) => GRUPO_IPV6.test(grupo))) return null;

  const comprimido = partes.length === 2;
  if (!comprimido && cabeca.length !== 8) return null;

  // Com `::`, os grupos omitidos são zeros: se a cabeça tem menos de três,
  // os que faltam para completar os 48 bits são zero por definição.
  const tres = [...cabeca.slice(0, 3)];
  while (comprimido && tres.length < 3) tres.push('0');
  if (tres.length < 3) return null;

  return tres.map((grupo) => grupo.replace(/^0+(?=.)/, ''));
}
