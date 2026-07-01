# Jubby

App de tarefas desktop com estética CRT/terminal. Glossário do domínio.

## Language

**Task**:
Unidade de trabalho do usuário. Vive dentro de exatamente uma Folder. Percorre o ciclo de vida `todo → on-going → done`.
_Avoid_: To-do, item, entry.

**on-going task**:
A única Task em que o usuário está trabalhando agora — singleton global no app inteiro. Iniciar outra devolve a anterior para `todo`. Fica fixada no topo da listagem, com destaque visual.
_Avoid_: In progress, ativa, current, WIP.

**Parar**:
Devolver a on-going task para `todo` sem concluí-la, por ação explícita do usuário (distinto da demoção automática ao iniciar outra).
_Avoid_: Pausar, cancelar, remover do on-going.

**Folder**:
Container exclusivo e primário de Tasks. Toda Task pertence a uma única Folder. Estabelece "onde a Task mora".
_Avoid_: List, project, category, group.

**Tag**:
Entidade de primeira classe (tem `id` e `name` próprios) usada como rótulo cross-cutting em Tasks. Uma Task pode ter várias Tags; uma Tag pode estar em Tasks de várias Folders. Não substitui Folder — é uma camada adicional de classificação ("como a Task é"), enquanto Folder define "onde mora".
_Avoid_: Label, category, marker.
