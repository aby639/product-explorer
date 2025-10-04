import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';

export class CreateViewDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  path!: string[];
}
