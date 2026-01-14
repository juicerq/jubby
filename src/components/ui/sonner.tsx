import { Toaster as Sonner } from 'sonner'

function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      expand={false}
      richColors
      toastOptions={{
        classNames: {
          toast:
            'bg-[#141414] border-white/10 text-white/90 text-[13px] shadow-lg',
          error: 'bg-red-500/10 border-red-500/20 text-red-400',
          success: 'bg-green-500/10 border-green-500/20 text-green-400',
        },
      }}
    />
  )
}

export { Toaster }
