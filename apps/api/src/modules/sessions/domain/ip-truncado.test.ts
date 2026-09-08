import { describe, expect, it } from 'vitest';
import { truncarIp } from './ip-truncado.js';

describe('truncarIp', () => {
  it('zera o último octeto do IPv4', () => {
    expect(truncarIp('189.45.201.77')).toBe('189.45.201.0');
    expect(truncarIp('10.0.0.1')).toBe('10.0.0.0');
  });

  it('trata IPv4 mapeado em IPv6 como IPv4', () => {
    // É o que o Node entrega num socket dual-stack. Truncar como IPv6 aqui
    // zeraria justamente a parte que é o endereço.
    expect(truncarIp('::ffff:189.45.201.77')).toBe('189.45.201.0');
  });

  it('mantém só os 48 bits mais significativos do IPv6', () => {
    expect(truncarIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3::');
    expect(truncarIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::');
  });

  it('completa com zero o IPv6 comprimido curto demais', () => {
    expect(truncarIp('fe80::1')).toBe('fe80:0:0::');
    expect(truncarIp('::1')).toBe('0:0:0::');
  });

  it('normaliza maiúsculas e espaços', () => {
    expect(truncarIp('  2001:DB8::1  ')).toBe('2001:db8:0::');
  });

  it('devolve null para o que não souber ler', () => {
    expect(truncarIp(null)).toBeNull();
    expect(truncarIp(undefined)).toBeNull();
    expect(truncarIp('')).toBeNull();
    expect(truncarIp('não é ip')).toBeNull();
    // Octeto fora da faixa e IPv6 sem compressão com grupos de menos: dá
    // para "quase" ler os dois, e é justamente por isso que não lemos.
    expect(truncarIp('300.1.2.3')).toBeNull();
    expect(truncarIp('2001:db8:1')).toBeNull();
    expect(truncarIp('2001::db8::1')).toBeNull();
  });
});
