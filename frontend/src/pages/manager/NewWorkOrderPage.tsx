import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/Primitives";
import { NewWorkOrderWizard } from "../../features/work-orders/NewWorkOrderWizard";

export function NewWorkOrderPage() {
  return (
    <>
      <PageHeader
        back={
          <Link to="/manager/work-orders" className="back-link">
            <Icon name="arrowLeft" size={15} />
            Work orders
          </Link>
        }
        title="New work order"
        subtitle="Describe the job, split it into tasks, and set what the evidence must show."
      />
      <NewWorkOrderWizard />
    </>
  );
}
