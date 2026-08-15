import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Route, Save, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getPostOrderAddonPricingSettings,
  savePostOrderAddonFeeTiers,
  type PostOrderAddonFeeTier,
} from "../../shared/api/postOrderAddonPricingApi";
import { normalizePostOrderAddonFeeTiers } from "../../shared/postOrderAddonPricing";

type Props = {
  readonly onBack: () => void;
  readonly Header: (props: {
    title: string;
    description: string;
    onBack: () => void;
  }) => ReactNode;
};

const emptyTier = (tiers: readonly PostOrderAddonFeeTier[]) => ({
  maxExtraDistanceKm:
    Math.round(((tiers.at(-1)?.maxExtraDistanceKm ?? 0) + 1) * 10) / 10,
  fee: Math.round((tiers.at(-1)?.fee ?? 0) + 10),
});

export function PlatformAddonPricingSettings({ onBack, Header }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["post-order-addon-pricing-settings"],
    queryFn: getPostOrderAddonPricingSettings,
  });
  const [tiers, setTiers] = useState<PostOrderAddonFeeTier[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setTiers([...settingsQuery.data.tiers]);
  }, [settingsQuery.data]);

  const updateTier = (
    index: number,
    patch: Partial<PostOrderAddonFeeTier>,
  ) => {
    setTiers((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, ...patch } : tier,
      ),
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizePostOrderAddonFeeTiers(tiers);
    const maxDistance = settingsQuery.data?.maxExtraDistanceKm ?? 0;
    if (normalized.length === 0) {
      toast.error("Добавьте хотя бы один тариф");
      return;
    }
    if (
      normalized.some(
        (tier, index) =>
          index > 0 &&
          tier.maxExtraDistanceKm ===
            normalized[index - 1]?.maxExtraDistanceKm,
      )
    ) {
      toast.error("Границы расстояния не должны повторяться");
      return;
    }
    if ((normalized.at(-1)?.maxExtraDistanceKm ?? 0) < maxDistance) {
      toast.error(`Последний тариф должен покрывать минимум ${maxDistance} км`);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await savePostOrderAddonFeeTiers(normalized);
      setTiers([...saved.tiers]);
      await queryClient.invalidateQueries({
        queryKey: ["post-order-addon-pricing-settings"],
      });
      toast.success("Тарифы дополнительной остановки сохранены");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить тарифы",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="platform-page platform-compact-detail">
      <Header
        title="Дополнительная остановка"
        description="Стоимость объединённой доставки по размеру крюка"
        onBack={onBack}
      />
      <form className="platform-addon-pricing" onSubmit={save}>
        <section className="platform-addon-pricing__intro">
          <span><Route /></span>
          <div>
            <strong>Как считается цена</strong>
            <p>
              Сервер определяет фактический дополнительный путь до магазина и
              выбирает первый подходящий тариф. Общая доставка равна базовой
              цене доставки плюс этой доплате.
            </p>
          </div>
        </section>

        {settingsQuery.isLoading ? (
          <div className="platform-addon-pricing__skeleton" aria-label="Загружаем тарифы">
            <span /><span /><span />
          </div>
        ) : settingsQuery.isError ? (
          <section className="platform-addon-pricing__error" role="alert">
            <p>Не удалось загрузить тарифы.</p>
            <button type="button" onClick={() => void settingsQuery.refetch()}>
              Повторить
            </button>
          </section>
        ) : (
          <section className="platform-addon-pricing__tiers">
            <header>
              <div>
                <h2>Тарифные интервалы</h2>
                <p>
                  Допустимый крюк сейчас — до {settingsQuery.data?.maxExtraDistanceKm ?? 0} км.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTiers((current) => [...current, emptyTier(current)])}
                disabled={tiers.length >= 10}
              >
                <Plus /> Добавить
              </button>
            </header>

            <div className="platform-addon-pricing__head" aria-hidden="true">
              <span>Крюк до</span><span>Доплата</span><span />
            </div>
            {tiers.map((tier, index) => (
              <div className="platform-addon-pricing__row" key={tier.id ?? `new-${index}`}>
                <label>
                  <span>Крюк до</span>
                  <span className="platform-addon-pricing__input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      max="100"
                      step="0.1"
                      value={tier.maxExtraDistanceKm}
                      onChange={(event) =>
                        updateTier(index, {
                          maxExtraDistanceKm: Number(event.target.value),
                        })
                      }
                      aria-label={`Максимальный крюк тарифа ${index + 1}, км`}
                    />
                    <b>км</b>
                  </span>
                </label>
                <label>
                  <span>Доплата</span>
                  <span className="platform-addon-pricing__input">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="10000"
                      step="1"
                      value={tier.fee}
                      onChange={(event) =>
                        updateTier(index, { fee: Number(event.target.value) })
                      }
                      aria-label={`Доплата тарифа ${index + 1}, рубли`}
                    />
                    <b>₽</b>
                  </span>
                </label>
                <button
                  type="button"
                  aria-label={`Удалить тариф ${index + 1}`}
                  onClick={() =>
                    setTiers((current) =>
                      current.filter((_, tierIndex) => tierIndex !== index),
                    )
                  }
                  disabled={tiers.length === 1}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </section>
        )}

        <footer>
          <small>Изменения применяются только к новым расчётам. Уже созданная цена заказа не меняется.</small>
          <button type="submit" disabled={isSaving || settingsQuery.isLoading || settingsQuery.isError}>
            <Save /> {isSaving ? "Сохраняем…" : "Сохранить тарифы"}
          </button>
        </footer>
      </form>
    </main>
  );
}
