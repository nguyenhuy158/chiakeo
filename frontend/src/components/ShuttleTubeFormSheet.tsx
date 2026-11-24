import { type FormEvent, useState } from "react";
import type { ApiShuttleTube } from "../../../shared/api-types";
import type { ShuttleTubeInput } from "../../../shared/schemas";
import {
  DEFAULT_TUBE_QUANTITY,
  defaultShuttlePrice,
  MAX_TUBE_QUANTITY,
  SHUTTLE_TUBE_NAME_MAX_LENGTH,
} from "../../../shared/shuttles";
import { parseMoney } from "../core/domain/money";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { AdaptiveSheet } from "./AdaptiveSheet";
import { MoneyInput } from "./MoneyInput";

type TubeFormProps = {
  tube: ApiShuttleTube | null;
  pending: boolean;
  onSubmit: (input: ShuttleTubeInput) => Promise<void>;
};

type FormErrors = { name?: string; initialQuantity?: string };

const NAME_REQUIRED = "Nhập tên ống cầu";
const QUANTITY_INVALID = `Nhập số trái từ 1 đến ${MAX_TUBE_QUANTITY}`;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function TubeForm({ tube, pending, onSubmit }: TubeFormProps) {
  const [name, setName] = useState(tube?.name ?? "");
  const [tubePrice, setTubePrice] = useState(
    tube && tube.tubePrice > 0 ? String(tube.tubePrice) : "",
  );
  const [quantity, setQuantity] = useState(
    String(tube?.initialQuantity ?? DEFAULT_TUBE_QUANTITY),
  );
  const [shuttlePrice, setShuttlePrice] = useState(
    tube && tube.shuttlePrice > 0 ? String(tube.shuttlePrice) : "",
  );
  const [shuttlePriceEdited, setShuttlePriceEdited] = useState(
    tube
      ? tube.shuttlePrice !==
          defaultShuttlePrice(tube.tubePrice, tube.initialQuantity)
      : false,
  );
  const [errors, setErrors] = useState<FormErrors>({});

  function autofillShuttlePrice(nextTubePrice: string, nextQuantity: string) {
    if (shuttlePriceEdited) return;
    const price = defaultShuttlePrice(
      parseMoney(nextTubePrice),
      Number(nextQuantity),
    );
    setShuttlePrice(price > 0 ? String(price) : "");
  }

  function changeTubePrice(value: string) {
    setTubePrice(value);
    autofillShuttlePrice(value, quantity);
  }

  function changeQuantity(value: string) {
    const digits = digitsOnly(value);
    setQuantity(digits);
    autofillShuttlePrice(tubePrice, digits);
  }

  function changeShuttlePrice(value: string) {
    setShuttlePrice(value);
    setShuttlePriceEdited(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = NAME_REQUIRED;
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > MAX_TUBE_QUANTITY
    ) {
      nextErrors.initialQuantity = QUANTITY_INVALID;
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.initialQuantity) return;

    await onSubmit({
      name: name.trim(),
      tubePrice: parseMoney(tubePrice),
      shuttlePrice: parseMoney(shuttlePrice),
      initialQuantity: parsedQuantity,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pb-2">
      <Field label="Tên ống" error={errors.name}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={SHUTTLE_TUBE_NAME_MAX_LENGTH}
          placeholder="Ống Hải Yến"
        />
      </Field>
      <Field label="Giá cả ống (đ)">
        <MoneyInput
          value={tubePrice}
          onChange={changeTubePrice}
          placeholder="360.000"
        />
      </Field>
      <Field
        label="Số trái trong ống"
        hint={
          tube
            ? "Chỉ dùng để tính giá mỗi trái, không đổi số cầu còn lại."
            : "Kho của ống bắt đầu bằng số này."
        }
        error={errors.initialQuantity}
      >
        <Input
          value={quantity}
          onChange={(event) => changeQuantity(event.target.value)}
          inputMode="numeric"
        />
      </Field>
      <Field label="Giá mỗi trái (đ)" hint="Tự tính từ giá cả ống, sửa được.">
        <MoneyInput
          value={shuttlePrice}
          onChange={changeShuttlePrice}
          placeholder="30.000"
        />
      </Field>
      <Button type="submit" block loading={pending}>
        {tube ? "Lưu ống cầu" : "Thêm ống cầu"}
      </Button>
    </form>
  );
}

type ShuttleTubeFormSheetProps = {
  open: boolean;
  tube: ApiShuttleTube | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: ShuttleTubeInput) => Promise<void>;
};

export function ShuttleTubeFormSheet({
  open,
  tube,
  pending,
  onClose,
  onSubmit,
}: ShuttleTubeFormSheetProps) {
  return (
    <AdaptiveSheet
      open={open}
      onClose={onClose}
      title={tube ? "Sửa ống cầu" : "Thêm ống cầu"}
    >
      <TubeForm
        key={tube?.id ?? "new"}
        tube={tube}
        pending={pending}
        onSubmit={onSubmit}
      />
    </AdaptiveSheet>
  );
}
