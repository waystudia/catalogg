import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { CatalogStaffRole } from '../../entities/catalogStaff';
import {
  getCatalogStaffMembers,
  linkCatalogStaffByEmail,
  removeCatalogStaffMember,
  type CatalogStaffMember
} from '../../shared/api/catalogStaffApi';
import './catalog-team-page.css';

const roleHelp: Record<Exclude<CatalogStaffRole, null>, string> = {
  picker: 'Получает новый заказ, принимает его и ведёт сборку.',
  manager: 'Видит очередь заказов и может контролировать назначения.'
};

export function CatalogTeamPage({ catalogId }: { catalogId: string }) {
  const [members, setMembers] = useState<CatalogStaffMember[]>([]);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState<Exclude<CatalogStaffRole, null>>('picker');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await getCatalogStaffMembers(catalogId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить команду');
    } finally {
      setLoading(false);
    }
  }, [catalogId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addMember = async () => {
    if (!email.trim() || saving) return;
    setSaving(true);
    try {
      const member = await linkCatalogStaffByEmail({ catalogId, email, roleCode });
      setMembers((current) => [member, ...current.filter((item) => item.userId !== member.userId)]);
      setEmail('');
      toast.success('Сотрудник добавлен');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить сотрудника');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: CatalogStaffMember) => {
    if (removingUserId) return;
    setRemovingUserId(member.userId);
    try {
      const removed = await removeCatalogStaffMember(catalogId, member.userId);
      if (!removed) throw new Error('Сотрудник уже удалён');
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      toast.success('Доступ сотрудника отключён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить сотрудника');
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="catalog-team-page">
      <section className="ra-card catalog-team-page__intro">
        <span><Users /></span>
        <div>
          <h2>Команда бизнеса</h2>
          <p>Роли действуют только внутри этого магазина. Они не дают доступ к другим бизнесам WayYaam.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw /> Обновить
        </button>
      </section>

      <section className="ra-card catalog-team-page__form">
        <div>
          <h3><UserPlus /> Добавить сотрудника</h3>
          <p>У сотрудника уже должен быть аккаунт WayYaam с этим e-mail.</p>
        </div>
        <label>
          E-mail сотрудника
          <input
            type="email"
            value={email}
            placeholder="worker@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Роль
          <select
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value as Exclude<CatalogStaffRole, null>)}
          >
            <option value="picker">Сборщик</option>
            <option value="manager">Менеджер заказов</option>
          </select>
        </label>
        <p className="catalog-team-page__role-help"><ShieldCheck />{roleHelp[roleCode]}</p>
        <button type="button" onClick={() => void addMember()} disabled={!email.trim() || saving}>
          <UserPlus /> {saving ? 'Добавляем...' : 'Добавить'}
        </button>
      </section>

      <section className="ra-card catalog-team-page__members" aria-busy={loading}>
        <header>
          <h3>Сотрудники</h3>
          <span>{members.length}</span>
        </header>
        {loading ? (
          <p>Загружаем команду...</p>
        ) : members.length === 0 ? (
          <div className="catalog-team-page__empty">
            <Users />
            <strong>Пока работает только администратор</strong>
            <p>Новые заказы останутся у владельца, пока вы не добавите сборщика.</p>
          </div>
        ) : (
          <div className="catalog-team-page__list">
            {members.map((member) => (
              <article key={member.userId}>
                <span>{member.fullName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{member.fullName}</strong>
                  <small>{member.email}</small>
                </div>
                <em>{member.roleName}</em>
                <small>{member.receivesNewOrders ? 'Получает новые заказы' : 'Без автоназначения'}</small>
                <button
                  type="button"
                  aria-label={`Удалить ${member.fullName}`}
                  disabled={removingUserId === member.userId}
                  onClick={() => void removeMember(member)}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
