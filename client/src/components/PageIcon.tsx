// page.icon 은 이모지 문자열이거나 업로드된 이미지 경로(/uploads/...)다.
// '/' 또는 'http' 로 시작하면 이미지 아이콘으로 간주한다 (이모지는 그럴 수 없다).
export function isImageIcon(icon?: string | null): icon is string {
  return typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http'))
}

export function PageIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  if (isImageIcon(icon)) {
    return (
      <img
        className="page-icon-img"
        src={icon}
        alt=""
        style={{ width: size, height: size }}
      />
    )
  }
  return <>{icon}</>
}
