; NexQ NSIS installer hooks
; Installs Visual C++ 2015-2022 Redistributable if not present

!macro NSIS_HOOK_PREINSTALL
  ; Check if Visual C++ 2015-2022 Redistributable (x64) is already installed
  ReadRegDWord $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"

  ${If} $0 == 1
    DetailPrint "Visual C++ Runtime: already installed"
    Goto vcredist_done
  ${EndIf}

  DetailPrint "Downloading Visual C++ Runtime..."
  Delete "$TEMP\vc_redist.x64.exe"

  NSISdl::download "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe"
  Pop $0

  ${If} $0 == "success"
    DetailPrint "Installing Visual C++ Runtime..."
    ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $1
    Delete "$TEMP\vc_redist.x64.exe"
  ${Else}
    MessageBox MB_ICONEXCLAMATION "Could not download Visual C++ Runtime.$\nPlease install it manually from:$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
  ${EndIf}

  vcredist_done:
!macroend
