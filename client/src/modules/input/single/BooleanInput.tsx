import React, { useCallback } from "react";
import RatioInput from "./RatioInput";

// Extract props from RatioInput, omitting 'options' and 'data'/'setData'/'onTempDataChange'
// so we can redefine them with boolean types.
type BaseRatioProps = Omit<
  React.ComponentProps<typeof RatioInput>,
  "options" | "data" | "setData" | "onTempDataChange"
>;

export interface BooleanInputProps extends BaseRatioProps {
  data: boolean;
  setData: (val: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
  onTempDataChange?: (
    tempData: boolean,
    setTempData: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
}

export default function BooleanInput({
  data,
  setData,
  trueLabel = "Yes",
  falseLabel = "No",
  onTempDataChange,
  ...restProps
}: BooleanInputProps) {
  // Map boolean data prop to string representation for RatioInput
  const stringData = data === true ? trueLabel : falseLabel;

  // Options array passed down to RatioInput
  const options = [trueLabel, falseLabel];

  // Map RatioInput string updates back to boolean
  const handleSetData = useCallback(
    (val: string) => {
      setData(val === trueLabel);
    },
    [setData, trueLabel]
  );

  // Adapt onTempDataChange callback if provided
  const handleTempDataChange = useCallback(
    (
      tempDataString: string,
      setTempDataString: React.Dispatch<React.SetStateAction<string>>
    ) => {
      if (!onTempDataChange) return;

      const tempDataBool = tempDataString === trueLabel;

      const setTempDataBool: React.Dispatch<React.SetStateAction<boolean>> = (
        action
      ) => {
        setTempDataString((prevString) => {
          const prevBool = prevString === trueLabel;
          const nextBool =
            typeof action === "function" ? action(prevBool) : action;
          return nextBool ? trueLabel : falseLabel;
        });
      };

      onTempDataChange(tempDataBool, setTempDataBool);
    },
    [onTempDataChange, trueLabel, falseLabel]
  );

  return (
    <RatioInput
      {...restProps}
      options={options}
      data={stringData}
      setData={handleSetData}
      onTempDataChange={onTempDataChange ? handleTempDataChange : undefined}
    />
  );
}