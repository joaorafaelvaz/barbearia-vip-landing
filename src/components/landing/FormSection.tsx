import { site } from "@/content/site";
import { Section } from "@/components/ui/section";
import { Alert } from "@/components/ui/alert";
import { PreCadastroForm, type UnitGroup } from "@/components/PreCadastroForm";

export function FormSection({
  unitGroups,
  defaultUnitSlug,
}: {
  unitGroups: UnitGroup[];
  defaultUnitSlug?: string;
}) {
  const hasUnits = unitGroups.some((g) => g.units.length > 0);
  return (
    <Section id="cadastro" title={site.form.sectionTitle} subtitle={site.form.sectionSubtitle} tone="surface">
      <div className="mx-auto max-w-xl">
        {!hasUnits && (
          <Alert tone="warning" className="mb-4">
            {site.form.step1.unit.emptyNotice}
          </Alert>
        )}
        <div className="rounded-card border border-line bg-bg p-5 sm:p-8">
          <PreCadastroForm unitGroups={unitGroups} defaultUnitSlug={defaultUnitSlug} />
        </div>
      </div>
    </Section>
  );
}
