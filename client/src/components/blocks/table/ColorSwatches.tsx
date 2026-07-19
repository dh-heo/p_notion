import { BG_COLORS } from './tableShared'

// 행/열 배경색 선택 팔레트 ("없음" + 색상 스와치)
export function ColorSwatches({
  value,
  onPick,
}: {
  value: number | null
  onPick: (i: number | null) => void
}) {
  return (
    <div className="b-bg-swatches">
      <button
        className={`b-bg-swatch b-bg-none${value == null ? ' active' : ''}`}
        title="없음"
        onClick={() => onPick(null)}
      />
      {BG_COLORS.map((bg, i) => (
        <button
          key={i}
          className={`b-bg-swatch${value === i ? ' active' : ''}`}
          style={{ background: bg }}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  )
}
