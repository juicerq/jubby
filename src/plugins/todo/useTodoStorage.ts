import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { Todo, Tag, TodoStatus, Folder, RecentTodo } from './types'

interface TodoFromBackend {
  id: string
  text: string
  status: string
  createdAt: number
  tagIds: string[]
}

interface TodoDataFromBackend {
  todos: TodoFromBackend[]
  tags: Tag[]
}

interface FolderFromBackend {
  id: string
  name: string
  position: number
  createdAt: number
  todoCount: number
  recentTodos: RecentTodo[]
}

interface UseTodoStorageReturn {
  todos: Todo[]
  tags: Tag[]
  isLoading: boolean

  createTodo: (text: string, tagIds?: string[]) => Promise<void>
  updateTodoStatus: (id: string, status: TodoStatus) => Promise<void>
  deleteTodo: (id: string) => Promise<void>
  setTodoTags: (todoId: string, tagIds: string[]) => Promise<void>

  createTag: (name: string, color: string) => Promise<boolean>
  updateTag: (id: string, name: string, color: string) => Promise<boolean>
  deleteTag: (id: string) => Promise<void>
}

interface UseFolderStorageReturn {
  folders: Folder[]
  isLoading: boolean

  loadFolders: () => Promise<void>
  createFolder: (name: string) => Promise<Folder | null>
  renameFolder: (id: string, name: string) => Promise<boolean>
  deleteFolder: (id: string) => Promise<boolean>
  reorderFolders: (folderIds: string[]) => Promise<void>
}

function mapBackendTodo(todo: TodoFromBackend): Todo {
  return {
    id: todo.id,
    text: todo.text,
    status: todo.status as TodoStatus,
    createdAt: todo.createdAt,
    tagIds: todo.tagIds,
  }
}

function mapBackendFolder(folder: FolderFromBackend): Folder {
  return {
    id: folder.id,
    name: folder.name,
    position: folder.position,
    createdAt: folder.createdAt,
    todoCount: folder.todoCount,
    recentTodos: folder.recentTodos,
  }
}

export function useTodoStorage(folderId: string): UseTodoStorageReturn {
  const [todos, setTodos] = useState<Todo[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await invoke<TodoDataFromBackend>('todo_get_by_folder', { folderId })
        setTodos(data.todos.map(mapBackendTodo))
        setTags(data.tags)
      } catch (error) {
        console.error('Failed to load todo data:', error)
        toast.error('Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [folderId])

  const createTodo = useCallback(async (text: string, tagIds?: string[]) => {
    const tempId = `temp-${Date.now()}`
    const optimisticTodo: Todo = {
      id: tempId,
      text,
      status: 'pending',
      createdAt: Date.now(),
      tagIds: tagIds ?? [],
    }

    setTodos((prev) => [optimisticTodo, ...prev])

    try {
      const newTodo = await invoke<TodoFromBackend>('todo_create', {
        folderId,
        text,
        tagIds: tagIds ?? null,
      })
      setTodos((prev) =>
        prev.map((t) => (t.id === tempId ? mapBackendTodo(newTodo) : t))
      )
    } catch (error) {
      setTodos((prev) => prev.filter((t) => t.id !== tempId))
      toast.error('Failed to create todo')
    }
  }, [folderId])

  const updateTodoStatus = useCallback(
    async (id: string, status: TodoStatus) => {
      const previousTodos = todos

      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status } : t))
      )

      try {
        await invoke('todo_update_status', { id, status })
      } catch (error) {
        setTodos(previousTodos)
        toast.error('Failed to update todo')
      }
    },
    [todos]
  )

  const deleteTodo = useCallback(
    async (id: string) => {
      const previousTodos = todos

      setTodos((prev) => prev.filter((t) => t.id !== id))

      try {
        await invoke('todo_delete', { id })
      } catch (error) {
        setTodos(previousTodos)
        toast.error('Failed to delete todo')
      }
    },
    [todos]
  )

  const setTodoTags = useCallback(
    async (todoId: string, tagIds: string[]) => {
      const previousTodos = todos

      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, tagIds } : t))
      )

      try {
        await invoke('todo_set_tags', { todoId, tagIds })
      } catch (error) {
        setTodos(previousTodos)
        toast.error('Failed to update tags')
      }
    },
    [todos]
  )

  const createTag = useCallback(async (name: string, color: string) => {
    const tempId = `temp-${Date.now()}`
    const optimisticTag: Tag = { id: tempId, name, color }

    setTags((prev) => [...prev, optimisticTag])

    try {
      const newTag = await invoke<Tag>('tag_create', { folderId, name, color })
      setTags((prev) => prev.map((t) => (t.id === tempId ? newTag : t)))
      return true
    } catch (error) {
      setTags((prev) => prev.filter((t) => t.id !== tempId))
      const errorMsg = String(error)
      if (errorMsg.includes('already exists')) {
        return false
      }
      toast.error('Failed to create tag')
      return false
    }
  }, [folderId])

  const updateTag = useCallback(
    async (id: string, name: string, color: string) => {
      const previousTags = tags

      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, name, color } : t)))

      try {
        await invoke('tag_update', { id, name, color })
        return true
      } catch (error) {
        setTags(previousTags)
        const errorMsg = String(error)
        if (errorMsg.includes('already exists')) {
          return false
        }
        toast.error('Failed to update tag')
        return false
      }
    },
    [tags]
  )

  const deleteTag = useCallback(
    async (id: string) => {
      const previousTags = tags
      const previousTodos = todos

      setTags((prev) => prev.filter((t) => t.id !== id))
      setTodos((prev) =>
        prev.map((t) => ({
          ...t,
          tagIds: t.tagIds?.filter((tagId) => tagId !== id),
        }))
      )

      try {
        await invoke('tag_delete', { id })
      } catch (error) {
        setTags(previousTags)
        setTodos(previousTodos)
        toast.error('Failed to delete tag')
      }
    },
    [tags, todos]
  )

  return {
    todos,
    tags,
    isLoading,
    createTodo,
    updateTodoStatus,
    deleteTodo,
    setTodoTags,
    createTag,
    updateTag,
    deleteTag,
  }
}

export function useFolderStorage(): UseFolderStorageReturn {
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadFolders = useCallback(async () => {
    try {
      const data = await invoke<FolderFromBackend[]>('folder_get_all')
      setFolders(data.map(mapBackendFolder))
    } catch (error) {
      console.error('Failed to load folders:', error)
      toast.error('Failed to load folders')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  const createFolder = useCallback(async (name: string) => {
    const tempId = `temp-${Date.now()}`
    const optimisticFolder: Folder = {
      id: tempId,
      name,
      position: folders.length,
      createdAt: Date.now(),
      todoCount: 0,
      recentTodos: [],
    }

    setFolders((prev) => [...prev, optimisticFolder])

    try {
      const newFolder = await invoke<FolderFromBackend>('folder_create', { name })
      const mappedFolder = mapBackendFolder(newFolder)
      setFolders((prev) =>
        prev.map((f) => (f.id === tempId ? { ...mappedFolder, todoCount: 0, recentTodos: [] } : f))
      )
      return mappedFolder
    } catch (error) {
      setFolders((prev) => prev.filter((f) => f.id !== tempId))
      toast.error('Failed to create folder')
      return null
    }
  }, [folders.length])

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const previousFolders = folders

      setFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name } : f))
      )

      try {
        await invoke('folder_rename', { id, name })
        return true
      } catch (error) {
        setFolders(previousFolders)
        toast.error('Failed to rename folder')
        return false
      }
    },
    [folders]
  )

  const deleteFolder = useCallback(
    async (id: string) => {
      const previousFolders = folders

      setFolders((prev) => prev.filter((f) => f.id !== id))

      try {
        await invoke('folder_delete', { id })
        return true
      } catch (error) {
        setFolders(previousFolders)
        toast.error('Failed to delete folder')
        return false
      }
    },
    [folders]
  )

  const reorderFolders = useCallback(
    async (folderIds: string[]) => {
      const previousFolders = folders

      // Reorder folders based on the new ID order
      setFolders((prev) => {
        const folderMap = new Map(prev.map((f) => [f.id, f]))
        return folderIds
          .map((id, index) => {
            const folder = folderMap.get(id)
            return folder ? { ...folder, position: index } : null
          })
          .filter((f): f is Folder => f !== null)
      })

      try {
        await invoke('folder_reorder', { folderIds })
      } catch (error) {
        setFolders(previousFolders)
        toast.error('Failed to reorder folders')
      }
    },
    [folders]
  )

  return {
    folders,
    isLoading,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
  }
}
