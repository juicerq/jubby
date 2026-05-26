# Jubby

App de tarefas desktop com estética CRT/terminal. Glossário do domínio.

## Language

**Task**:
Unidade de trabalho do usuário. Vive dentro de exatamente uma Folder. Pode estar `done` ou pendente.
_Avoid_: To-do, item, entry.

**Folder**:
Container exclusivo e primário de Tasks. Toda Task pertence a uma única Folder. Estabelece "onde a Task mora".
_Avoid_: List, project, category, group.

**Tag**:
Entidade de primeira classe (tem `id` e `name` próprios) usada como rótulo cross-cutting em Tasks. Uma Task pode ter várias Tags; uma Tag pode estar em Tasks de várias Folders. Não substitui Folder — é uma camada adicional de classificação ("como a Task é"), enquanto Folder define "onde mora".
_Avoid_: Label, category, marker.

**QUEUE**:
Visão de todas as Tasks pendentes do app, agrupando por Folder. Página inicial.
_Avoid_: Inbox, backlog, pending list.
