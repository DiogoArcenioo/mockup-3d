type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

export function setupInstallUI(notify: (message: string, error?: boolean) => void) {
  const button = document.querySelector<HTMLButtonElement>('#install-app')!;
  const dialog = document.querySelector<HTMLDialogElement>('#install-dialog')!;
  const confirm = document.querySelector<HTMLButtonElement>('#confirm-install')!;
  const instructions = document.querySelector<HTMLElement>('#install-instructions')!;
  const note = document.querySelector<HTMLElement>('#install-note')!;
  const standalone = window.matchMedia('(display-mode: standalone)');
  let deferredPrompt: InstallPromptEvent | undefined;
  let installing = false;
  let installed = standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  const update = () => {
    button.hidden = installed;
    confirm.hidden = !deferredPrompt;
    instructions.hidden = Boolean(deferredPrompt);
    note.hidden = window.isSecureContext;
  };
  update();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = undefined;
    dialog.close();
    update();
    notify('O forma foi instalado. Seu estúdio agora está na tela inicial.');
  });
  standalone.addEventListener('change', event => {
    installed = event.matches;
    update();
  });

  const install = async () => {
    if (installing) return;
    if (!deferredPrompt) {
      update();
      dialog.showModal();
      return;
    }
    const prompt = deferredPrompt;
    deferredPrompt = undefined;
    installing = true;
    dialog.close();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        installed = true;
        notify('Instalação iniciada. O forma será adicionado aos seus aplicativos.');
      }
    } catch {
      notify('Abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”.', true);
    } finally {
      installing = false;
      update();
    }
  };
  button.addEventListener('click', () => void install());
  confirm.addEventListener('click', () => void install());
  dialog.querySelectorAll<HTMLButtonElement>('.install-close').forEach(close => {
    close.addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  // Cache compiled files only; Vite development assets change on every edit.
  if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
    const worker = new URL('sw.js', document.baseURI);
    void navigator.serviceWorker.register(worker.href, { scope: './', updateViaCache: 'none' })
      .then(registration => {
        const reportUpdate = () => {
          notify('Nova versão pronta. Feche e reabra o app quando terminar seu mockup.');
        };
        if (registration.waiting && navigator.serviceWorker.controller) reportUpdate();
        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          nextWorker?.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) reportUpdate();
          });
        });
      }).catch(error => console.warn('Não foi possível preparar o uso offline:', error));
  }
}
