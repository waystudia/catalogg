import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerDownLeft, MapPinned, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import {
  deleteAsphaltRoadCorridor,
  getAsphaltRoadCorridors,
  saveAsphaltRoadCorridor
} from '../../shared/api/asphaltRoadsApi';
import { findClosestAsphaltRoadPoint, type AsphaltRoadCorridor } from '../../shared/asphaltRoads';
import type { DeliveryMapCoordinates } from '../../shared/deliveryMap';
import './platform-asphalt-roads.css';

const formatUpdatedAt = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}).format(new Date(value));

export function PlatformAsphaltRoadsPage() {
  const queryClient = useQueryClient();
  const corridorsQuery = useQuery({
    queryKey: ['asphalt-road-corridors'],
    queryFn: getAsphaltRoadCorridors,
    staleTime: 15_000
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [name, setName] = useState('');
  const [points, setPoints] = useState<DeliveryMapCoordinates[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const corridors = useMemo(() => corridorsQuery.data ?? [], [corridorsQuery.data]);
  const groupNames = useMemo(
    () => Array.from(new Set(corridors.map((corridor) => corridor.groupName))).sort((a, b) => a.localeCompare(b, 'ru')),
    [corridors]
  );
  const corridorGroups = useMemo(
    () => groupNames.map((currentGroupName) => ({
      name: currentGroupName,
      corridors: corridors.filter((corridor) => corridor.groupName === currentGroupName)
    })),
    [corridors, groupNames]
  );
  const referenceCorridors = corridors.filter((corridor) => corridor.id !== editingId);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setGroupName('');
    setName('');
    setPoints([]);
  };

  const startNew = (selectedGroupName = '') => {
    setEditingId(null);
    setGroupName(selectedGroupName);
    setName(`Асфальтовый участок ${corridors.length + 1}`);
    setPoints([]);
    setEditorOpen(true);
  };

  const editCorridor = (corridor: AsphaltRoadCorridor) => {
    setEditingId(corridor.id);
    setGroupName(corridor.groupName);
    setName(corridor.name);
    setPoints([...corridor.points]);
    setEditorOpen(true);
  };

  const saveCorridor = async () => {
    setSaving(true);
    try {
      await saveAsphaltRoadCorridor({ id: editingId ?? undefined, groupName, name, points });
      await queryClient.invalidateQueries({ queryKey: ['asphalt-road-corridors'] });
      toast.success(editingId ? 'Асфальтовый участок обновлён' : 'Асфальтовый участок сохранён');
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить участок');
    } finally {
      setSaving(false);
    }
  };

  const addEditorPoint = (point: DeliveryMapCoordinates) => {
    const snapped = findClosestAsphaltRoadPoint(point, referenceCorridors);
    setPoints((current) => [...current, snapped?.point ?? point].slice(0, 100));
    if (snapped && points.length === 0) toast.success('Начало привязано к сохранённому асфальту');
  };

  const removeCorridor = async (corridor: AsphaltRoadCorridor) => {
    if (!window.confirm(`Удалить разметку «${corridor.name}»? Маршруты больше не будут учитывать этот участок.`)) return;
    try {
      await deleteAsphaltRoadCorridor(corridor.id);
      await queryClient.invalidateQueries({ queryKey: ['asphalt-road-corridors'] });
      toast.success('Разметка удалена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить разметку');
    }
  };

  return (
    <main className="platform-page platform-asphalt-roads-page">
      <header className="platform-page-head">
        <div>
          <h1>Асфальтовые дороги</h1>
          <p>Группируйте подтверждённый асфальт по сёлам и городам. Остальные дороги не считаются плохими.</p>
        </div>
        {!editorOpen && <button type="button" onClick={() => startNew()}><Plus />Выделить дорогу</button>}
      </header>

      {editorOpen && (
        <section className="asphalt-road-editor">
          <header>
            <div>
              <strong>{editingId ? 'Изменить разметку' : 'Новая асфальтовая дорога'}</strong>
              <span>Начать ответвление можно нажатием на зелёную сохранённую дорогу.</span>
            </div>
            <button type="button" onClick={closeEditor} aria-label="Закрыть редактор"><X /></button>
          </header>

          <ol className="asphalt-road-editor__steps">
            <li data-complete={points.length >= 1}><b>1</b><span>Начало</span></li>
            <li data-complete={points.length >= 3}><b>2</b><span>Промежуточные</span></li>
            <li data-complete={points.length >= 2}><b>3</b><span>Конец</span></li>
          </ol>

          <div className="asphalt-road-editor__fields">
            <label className="asphalt-road-editor__name">
              <span>Населённый пункт или группа</span>
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                list="asphalt-road-groups"
                maxLength={120}
                placeholder="Например, с. Алхан-Кала"
              />
              <datalist id="asphalt-road-groups">
                {groupNames.map((value) => <option key={value} value={value} />)}
              </datalist>
            </label>
            <label className="asphalt-road-editor__name">
              <span>Название участка</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </label>
          </div>

          <DeliveryTrackingMap
            className="asphalt-road-map"
            enableSearch
            routePoints={points}
            editorPoints={points}
            editorReferenceRoutes={referenceCorridors.map((corridor) => corridor.points)}
            preferAsphaltRoads={false}
            enableFullscreen
            onMapClick={addEditorPoint}
          />

          <div className="asphalt-road-editor__status" aria-live="polite">
            <MapPinned />
            <span>
              {points.length === 0
                ? 'Нажмите на начало асфальта'
                : points.length === 1
                  ? 'Теперь отметьте конец или следующий поворот'
                  : `Отмечено точек: ${points.length}. Последняя точка считается концом.`}
            </span>
          </div>

          <footer>
            <button type="button" disabled={points.length === 0} onClick={() => setPoints((current) => current.slice(0, -1))}>
              <CornerDownLeft />Убрать последнюю
            </button>
            <button type="button" disabled={points.length === 0} onClick={() => setPoints([])}>
              <RotateCcw />Очистить
            </button>
            <button className="is-primary" type="button" disabled={saving || points.length < 2 || !name.trim() || !groupName.trim()} onClick={() => void saveCorridor()}>
              <Save />{saving ? 'Сохраняем...' : 'Сохранить дорогу'}
            </button>
          </footer>
        </section>
      )}

      <section className="asphalt-road-list">
        <header>
          <div>
            <h2>Сохранённые дороги</h2>
            <p>Разметка лишь добавляет приоритет асфальту. Обычные дороги продолжают участвовать в расчёте.</p>
          </div>
          <strong>{corridorsQuery.data?.length ?? 0}</strong>
        </header>
        {corridorsQuery.isLoading && <div className="asphalt-road-list__empty">Загружаем разметку...</div>}
        {corridorsQuery.isError && (
          <div className="asphalt-road-list__empty">
            Не удалось загрузить дороги.
            <button type="button" onClick={() => void corridorsQuery.refetch()}>Повторить</button>
          </div>
        )}
        {!corridorsQuery.isLoading && !corridorsQuery.isError && (corridorsQuery.data?.length ?? 0) === 0 && (
          <div className="asphalt-road-list__empty">
            <MapPinned />
            <strong>Асфальт пока не отмечен</strong>
            <span>Добавьте первую дорогу двумя или несколькими нажатиями по карте.</span>
            <button type="button" onClick={() => startNew()}><Plus />Выделить дорогу</button>
          </div>
        )}
        {corridorGroups.map((group) => (
          <section className="asphalt-road-group" key={group.name}>
            <header>
              <div>
                <MapPinned />
                <span><strong>{group.name}</strong><small>{group.corridors.length} участков</small></span>
              </div>
              <button type="button" onClick={() => startNew(group.name)}><Plus />Добавить дорогу</button>
            </header>
            {group.corridors.map((corridor) => (
              <article key={corridor.id}>
                <span className="asphalt-road-list__icon"><MapPinned /></span>
                <div>
                  <strong>{corridor.name}</strong>
                  <span>{corridor.points.length} точек · обновлено {formatUpdatedAt(corridor.updatedAt)}</span>
                </div>
                <button type="button" onClick={() => editCorridor(corridor)}><Pencil />Изменить</button>
                <button className="is-danger" type="button" onClick={() => void removeCorridor(corridor)} aria-label={`Удалить ${corridor.name}`}><Trash2 /></button>
              </article>
            ))}
          </section>
        ))}
      </section>
    </main>
  );
}
