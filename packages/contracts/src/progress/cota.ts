/**
 * Quanto uma conta pode acumular de save na nuvem, em bytes: 32 MiB.
 *
 * O ADR 0020 deixou isto como pergunta em aberto: "upload é vetor de abuso"
 * (o mesmo raciocínio da #76, `COTA_DE_ARMAZENAMENTO_EM_BYTES`), mas a escala
 * aqui é outra — SRAM não é ROM.
 *
 * O número sai do perfil real, não de um palpite redondo: a mesma biblioteca
 * generosa que calibra a cota de ROM (cem de NES, cem de Game Boy, cem de
 * Mega Drive, cento e cinquenta de SNES, cem de GBA) tem save bem menor que
 * cartucho — poucos KiB na maioria dos sistemas, e só o GBA com flash save
 * chega perto de `TAMANHO_MAXIMO_DE_SRAM_EM_BYTES` na prática. Com folga
 * generosa por sistema (8 KiB para NES, 32 KiB para Game Boy e Mega Drive,
 * 8 KiB para SNES, 128 KiB para GBA), a soma fica perto de 21 MiB. Os 32 MiB
 * são cerca de 1,5 vez isso — folga para quem tem save maior que a média, sem
 * abrir espaço para acervo.
 *
 * Onde ele fecha rápido é no abuso: ao teto por arquivo
 * (`TAMANHO_MAXIMO_DE_SRAM_EM_BYTES`, 256 KiB), 32 MiB compram no máximo cento
 * e vinte e oito saves do tamanho máximo — uma fração da biblioteca inteira
 * que a cota de ROM permite (`COTA_DE_ROMS_POR_CONTA`, 1500), e é exatamente
 * por isso que não existe um segundo eixo de contagem aqui: a `UserSave` só
 * existe amarrada a uma `UserRom` já na biblioteca (ver o comentário do model
 * `UserSave` em schema.prisma), e essa amarração já limita a contagem a mil e
 * quinhentas — o eixo de bytes sempre recusa primeiro.
 *
 * Também é uma fração pequena da cota de ROM: 32 MiB é 1/128 dos 4 GiB de
 * `COTA_DE_ARMAZENAMENTO_EM_BYTES` — mesmo quem enche a biblioteca de ROM
 * inteira não chega perto de gastar o espaço equivalente em save.
 *
 * Mora no contrato, e não só no servidor, pela mesma razão da cota de ROM: o
 * front usa o mesmo número para explicar uma recusa, se ela algum dia
 * acontecer na prática.
 */
export const COTA_DE_SAVE_NA_NUVEM_EM_BYTES = 32 * 1024 * 1024;
