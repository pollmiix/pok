# GitHub automatico

O monitor envia as alteracoes deste projeto para `https://github.com/pollmiix/pok`, na branch `main`. Depois de salvar, aguarda duas verificacoes iguais, com intervalo de 5 segundos, cria um commit e faz push. Arquivos ignorados pelo Git, como `.env`, continuam ignorados. Todos os demais arquivos do projeto entram no envio, inclusive exclusoes.

Para ativar agora e a cada entrada no Windows, execute na pasta do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ativar-sync.ps1 -InstallStartup
```

O monitor funciona em segundo plano enquanto este usuario estiver conectado, com o computador ligado. Sem internet, os commits ficam locais e o envio e tentado novamente a cada minuto. Conflitos com o GitHub precisam ser resolvidos manualmente; o monitor nunca faz force push. Fora da branch `main` ou durante merge/rebase, a sincronizacao aguarda.

Para acompanhar:

```powershell
Get-Content .\.automation\sync.log -Tail 15 -Wait
```

Para parar e remover a inicializacao automatica:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\desativar-sync.ps1
```

O envio ao GitHub nao configura a hospedagem. Se o projeto Vercel estiver conectado a este repositorio com `main` como branch de producao, os pushes acionam os deploys conforme a configuracao da Vercel. Esse vinculo precisa existir na hospedagem para o site publicado atualizar.
