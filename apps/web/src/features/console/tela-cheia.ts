/** O elemento da página sobrevive à navegação entre biblioteca e partida. */
export async function entrarEmTelaCheiaDoConsole(): Promise<boolean> {
  if (document.fullscreenElement === document.documentElement) return true;
  try {
    if (!document.documentElement.requestFullscreen) return false;
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    // Gamepad e acesso direto podem não ter ativação de usuário. O jogo
    // continua ocupando a janela, com um botão para tentar novamente.
    return false;
  }
}
