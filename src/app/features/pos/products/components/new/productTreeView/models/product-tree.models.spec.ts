import { NODE_NAME_MAX_LENGTH, validateNodeName } from './product-tree.models';

describe('validateNodeName', () => {
      const siblingNames = ['مساحيق', 'سوائل ومنظفات'];

      it('should accept a valid and unique name', () => {
            const result = validateNodeName('شامبو جديد', siblingNames);

            expect(result.valid).toBeTrue();
            expect(result.error).toBeNull();
      });

      it('should accept the maximum allowed length', () => {
            const result = validateNodeName('م'.repeat(NODE_NAME_MAX_LENGTH), siblingNames);

            expect(result.valid).toBeTrue();
      });

      it('should reject a blank name', () => {
            expect(validateNodeName('   ', siblingNames)).toEqual({ valid: false, error: 'اسم العنصر مطلوب' });
      });

      it('should reject a name shorter than the minimum length', () => {
            const result = validateNodeName(' أ ', siblingNames);

            expect(result.valid).toBeFalse();
            expect(result.error).toContain('2');
      });

      it('should reject a name longer than the maximum length', () => {
            const result = validateNodeName('م'.repeat(NODE_NAME_MAX_LENGTH + 1), siblingNames);

            expect(result.valid).toBeFalse();
            expect(result.error).toContain(String(NODE_NAME_MAX_LENGTH));
      });

      it('should reject a duplicated name inside the same scope (trimmed comparison)', () => {
            const result = validateNodeName('  مساحيق  ', siblingNames);

            expect(result.valid).toBeFalse();
            expect(result.error).toContain('يوجد عنصر آخر بنفس الاسم');
      });

      it('should compare sibling names case insensitively', () => {
            const result = validateNodeName('ARIEL', ['Ariel']);

            expect(result.valid).toBeFalse();
      });
});